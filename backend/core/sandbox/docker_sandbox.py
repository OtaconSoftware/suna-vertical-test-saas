"""
Local Docker sandbox implementation using Docker Engine API via Unix socket.
Replaces Daytona SDK sandboxes with local Docker containers.
"""
import asyncio
import uuid
import json
import urllib.parse
from dataclasses import dataclass
from typing import Optional, Dict
import httpx
from core.utils.logger import logger

DOCKER_SOCKET = "/var/run/docker.sock"
SANDBOX_IMAGE = "breakit-sandbox:0.1.1"
VPS_IP = "46.225.104.202"

# Port range for sandbox containers
_BASE_PORT = 30000
_PORT_STEP = 10
_next_port_offset = 0
_port_lock = asyncio.Lock()


async def _next_base_port() -> int:
    global _next_port_offset
    async with _port_lock:
        port = _BASE_PORT + _next_port_offset
        _next_port_offset += _PORT_STEP
        if _next_port_offset > 500:
            _next_port_offset = 0
        return port


def _docker_client() -> httpx.AsyncClient:
    """Create an async HTTP client connected to Docker socket."""
    transport = httpx.AsyncHTTPTransport(uds=DOCKER_SOCKET)
    return httpx.AsyncClient(transport=transport, base_url="http://docker", timeout=30.0)


@dataclass
class ExecResult:
    exit_code: int
    result: str


@dataclass
class PreviewLink:
    url: str
    token: Optional[str] = None


class SandboxState:
    STARTED = "started"
    STOPPED = "stopped"
    ARCHIVED = "archived"
    ARCHIVING = "archiving"
    
    def __init__(self, value: str):
        self.value = value


class ProcessProxy:
    """Mimics AsyncSandbox.process using Docker Engine API."""
    
    def __init__(self, container_name: str):
        self.container_name = container_name
        self._sessions: Dict[str, bool] = {}
    
    async def exec(self, command: str, timeout: int = 30, env: Optional[Dict[str, str]] = None) -> ExecResult:
        """Execute command inside container via Docker API."""
        env_list = [f"{k}={v}" for k, v in (env or {}).items()]
        
        async with _docker_client() as client:
            # Create exec instance
            create_resp = await client.post(
                f"/containers/{self.container_name}/exec",
                json={
                    "Cmd": ["bash", "-c", command],
                    "AttachStdout": True,
                    "AttachStderr": True,
                    "Env": env_list if env_list else None,
                }
            )
            if create_resp.status_code != 201:
                return ExecResult(exit_code=1, result=f"Failed to create exec: {create_resp.text}")
            
            exec_id = create_resp.json()["Id"]
            
            # Start exec and get output
            start_resp = await client.post(
                f"/exec/{exec_id}/start",
                json={"Detach": False, "Tty": False},
                timeout=timeout + 5,
            )
            
            # Get the output (Docker multiplexes stdout/stderr with 8-byte headers)
            raw_output = start_resp.content
            output = _demux_docker_output(raw_output)
            
            # Get exit code
            inspect_resp = await client.get(f"/exec/{exec_id}/json")
            exit_code = 0
            if inspect_resp.status_code == 200:
                exit_code = inspect_resp.json().get("ExitCode", 0) or 0
            
            return ExecResult(exit_code=exit_code, result=output)
    
    async def create_session(self, session_id: str):
        self._sessions[session_id] = True
    
    async def execute_session_command(self, session_id: str, request):
        command = request.command if hasattr(request, 'command') else str(request)
        return await self.exec(command, timeout=300)
    
    async def delete_session(self, session_id: str):
        self._sessions.pop(session_id, None)
    
    async def create_pty_session(self, **kwargs):
        raise NotImplementedError("PTY sessions not supported in local Docker sandbox")


def _demux_docker_output(data: bytes) -> str:
    """Demultiplex Docker exec output stream (8-byte header per frame)."""
    output = []
    i = 0
    while i + 8 <= len(data):
        # Header: [stream_type(1), 0, 0, 0, size(4 big-endian)]
        stream_type = data[i]
        size = int.from_bytes(data[i+4:i+8], byteorder='big')
        i += 8
        if i + size <= len(data):
            output.append(data[i:i+size].decode('utf-8', errors='replace'))
        i += size
    if not output and data:
        # Fallback: raw output (no multiplexing, e.g., TTY mode)
        return data.decode('utf-8', errors='replace')
    return ''.join(output)


class LocalDockerSandbox:
    """Local Docker sandbox mimicking Daytona AsyncSandbox interface."""
    
    def __init__(self, container_name: str, sandbox_id: str, base_port: int):
        self.container_name = container_name
        self._id = sandbox_id
        self.base_port = base_port
        self.process = ProcessProxy(container_name)
        self.state = SandboxState(SandboxState.STARTED)
        self._port_map = {
            8004: base_port,
            6080: base_port + 1,
            5901: base_port + 2,
            8080: base_port + 3,
            7788: base_port + 4,
            8000: base_port + 5,
            5173: base_port + 6,
            4173: base_port + 7,
        }
        self.public = True
        self.network_block_all = False
        self.network_allow_list = None
    
    @property
    def id(self) -> str:
        return self._id
    
    async def get_preview_link(self, port: int) -> PreviewLink:
        external_port = self._port_map.get(port, port)
        url = f"http://{VPS_IP}:{external_port}"
        return PreviewLink(url=url, token=None)


async def create_local_sandbox(password: str, project_id: str = None) -> LocalDockerSandbox:
    """Create a new local Docker sandbox container via Docker API."""
    sandbox_id = str(uuid.uuid4())
    short_id = sandbox_id[:8]
    container_name = f"breakit-sandbox-{short_id}"
    base_port = await _next_base_port()
    
    port_map = {
        8004: base_port,
        6080: base_port + 1,
        5901: base_port + 2,
        8080: base_port + 3,
        7788: base_port + 4,
        8000: base_port + 5,
        5173: base_port + 6,
        4173: base_port + 7,
    }
    
    # Build port bindings for Docker API
    port_bindings = {}
    exposed_ports = {}
    for internal, external in port_map.items():
        key = f"{internal}/tcp"
        port_bindings[key] = [{"HostPort": str(external)}]
        exposed_ports[key] = {}
    
    env_list = [
        "CHROME_PERSISTENT_SESSION=true",
        "RESOLUTION=1048x768x24",
        "RESOLUTION_WIDTH=1048",
        "RESOLUTION_HEIGHT=768",
        f"VNC_PASSWORD={password}",
        "ANONYMIZED_TELEMETRY=false",
        "CHROME_PATH=",
        "CHROME_USER_DATA=",
        "CHROME_DEBUGGING_PORT=9222",
        "CHROME_DEBUGGING_HOST=localhost",
        "CHROME_CDP=",
    ]
    
    logger.info(f"Creating local Docker sandbox: {container_name} (ports {base_port}-{base_port+7})")
    
    async with _docker_client() as client:
        # Create container
        create_resp = await client.post(
            "/containers/create",
            params={"name": container_name},
            json={
                "Image": SANDBOX_IMAGE,
                "Env": env_list,
                "ExposedPorts": exposed_ports,
                "HostConfig": {
                    "PortBindings": port_bindings,
                },
                "Labels": {"breakit": "true", "project_id": project_id or ""},
            }
        )
        
        if create_resp.status_code not in (201, 200):
            raise RuntimeError(f"Failed to create container: {create_resp.text}")
        
        container_id = create_resp.json()["Id"]
        
        # Start container
        start_resp = await client.post(f"/containers/{container_name}/start")
        if start_resp.status_code not in (204, 200, 304):
            raise RuntimeError(f"Failed to start container: {start_resp.text}")
    
    logger.info(f"Docker sandbox {container_name} created and started (id: {container_id[:12]})")
    
    sandbox = LocalDockerSandbox(container_name, sandbox_id, base_port)
    return sandbox


async def get_or_start_local_sandbox(sandbox_id: str) -> LocalDockerSandbox:
    """Get an existing sandbox container."""
    short_id = sandbox_id[:8]
    
    async with _docker_client() as client:
        # List containers matching our pattern
        resp = await client.get(
            "/containers/json",
            params={"all": "true", "filters": json.dumps({"name": [f"breakit-sandbox-{short_id}"]})}
        )
        
        if resp.status_code == 200:
            containers = resp.json()
            for c in containers:
                name = c["Names"][0].lstrip("/")
                state = c.get("State", "")
                
                if state != "running":
                    await client.post(f"/containers/{name}/start")
                    await asyncio.sleep(2)
                
                base_port = _extract_base_port(c)
                return LocalDockerSandbox(name, sandbox_id, base_port)
    
    raise RuntimeError(f"Sandbox {sandbox_id} not found")


async def delete_local_sandbox(sandbox_id: str) -> bool:
    """Delete a local Docker sandbox."""
    short_id = sandbox_id[:8]
    
    async with _docker_client() as client:
        resp = await client.get(
            "/containers/json",
            params={"all": "true", "filters": json.dumps({"name": [f"breakit-sandbox-{short_id}"]})}
        )
        if resp.status_code == 200:
            for c in resp.json():
                name = c["Names"][0].lstrip("/")
                await client.delete(f"/containers/{name}", params={"force": "true"})
    return True


def _extract_base_port(container_info: dict) -> int:
    """Extract base port from container port mappings."""
    ports = container_info.get("Ports", [])
    for p in ports:
        if p.get("PrivatePort") == 8004:
            return p.get("PublicPort", _BASE_PORT)
    return _BASE_PORT
