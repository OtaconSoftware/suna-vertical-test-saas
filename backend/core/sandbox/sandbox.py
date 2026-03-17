"""
Sandbox management — switchable between Local Docker and Daytona Cloud.

Set SANDBOX_MODE=local or SANDBOX_MODE=daytona in backend .env
Default: local (no external dependency)
"""
import os
from core.utils.logger import logger

SANDBOX_MODE = os.environ.get("SANDBOX_MODE", "local").lower().strip()

if SANDBOX_MODE == "daytona":
    # ═══════════════════════════════════════════════════════
    # DAYTONA CLOUD MODE
    # ═══════════════════════════════════════════════════════
    logger.info("Using DAYTONA CLOUD sandbox mode")

    from daytona_sdk import (
        AsyncDaytona, DaytonaConfig, CreateSandboxFromSnapshotParams,
        AsyncSandbox, SessionExecuteRequest, Resources, SandboxState,
    )
    from dotenv import load_dotenv
    from core.utils.config import config, Configuration
    import asyncio

    load_dotenv()

    daytona_config = DaytonaConfig(
        api_key=config.DAYTONA_API_KEY,
        api_url=config.DAYTONA_SERVER_URL,
        target=config.DAYTONA_TARGET,
    )

    if daytona_config.api_key:
        logger.debug("Daytona sandbox configured successfully")
    else:
        logger.warning("No Daytona API key found in environment variables")

    if daytona_config.api_url:
        logger.debug(f"Daytona API URL set to: {daytona_config.api_url}")
    else:
        logger.warning("No Daytona API URL found in environment variables")

    if daytona_config.target:
        logger.debug(f"Daytona target set to: {daytona_config.target}")
    else:
        logger.warning("No Daytona target found in environment variables")

    daytona = AsyncDaytona(daytona_config)

    async def start_supervisord_session(sandbox: AsyncSandbox):
        """Start supervisord in a session."""
        session_id = "supervisord-session"
        try:
            await sandbox.process.create_session(session_id)
            await sandbox.process.execute_session_command(
                session_id,
                SessionExecuteRequest(
                    command="exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/supervisord.conf",
                    var_async=True,
                ),
            )
            logger.info("Supervisord started successfully")
        except Exception as e:
            logger.warning(f"Could not start supervisord: {str(e)}")

    async def get_or_start_sandbox(sandbox_id: str) -> AsyncSandbox:
        """Retrieve a sandbox by ID, check its state, and start it if needed."""
        logger.info(f"Getting or starting sandbox with ID: {sandbox_id}")
        try:
            sandbox = await daytona.get(sandbox_id)
            if sandbox.state in [SandboxState.ARCHIVED, SandboxState.STOPPED, SandboxState.ARCHIVING]:
                logger.info(f"Sandbox is in {sandbox.state} state. Starting...")
                try:
                    await daytona.start(sandbox)
                    for _ in range(30):
                        await asyncio.sleep(1)
                        sandbox = await daytona.get(sandbox_id)
                        if sandbox.state == SandboxState.STARTED:
                            break
                    await start_supervisord_session(sandbox)
                except Exception as e:
                    logger.error(f"Error starting sandbox: {e}")
                    raise
            logger.info(f"Sandbox {sandbox_id} is ready")
            return sandbox
        except Exception as e:
            logger.error(f"Error retrieving or starting sandbox: {str(e)}")
            raise

    async def create_sandbox(password: str, project_id: str = None) -> AsyncSandbox:
        """Create a new sandbox with all required services configured and running."""
        logger.info("Creating new Daytona sandbox environment")
        labels = {"id": project_id} if project_id else None
        params = CreateSandboxFromSnapshotParams(
            snapshot=Configuration.SANDBOX_SNAPSHOT_NAME,
            public=True,
            labels=labels,
            env_vars={
                "CHROME_PERSISTENT_SESSION": "true",
                "RESOLUTION": "1048x768x24",
                "RESOLUTION_WIDTH": "1048",
                "RESOLUTION_HEIGHT": "768",
                "VNC_PASSWORD": password,
                "ANONYMIZED_TELEMETRY": "false",
                "CHROME_PATH": "",
                "CHROME_USER_DATA": "",
                "CHROME_DEBUGGING_PORT": "9222",
                "CHROME_DEBUGGING_HOST": "localhost",
                "CHROME_CDP": "",
            },
            auto_stop_interval=15,
            auto_archive_interval=30,
            network_block_all=False,
        )
        sandbox = await daytona.create(params)
        logger.info(f"Sandbox created with ID: {sandbox.id}")
        await start_supervisord_session(sandbox)
        logger.info("Sandbox environment successfully initialized")
        return sandbox

    async def delete_sandbox(sandbox_id: str) -> bool:
        """Delete a sandbox by its ID."""
        logger.info(f"Deleting sandbox with ID: {sandbox_id}")
        try:
            sandbox = await daytona.get(sandbox_id)
            await daytona.delete(sandbox)
            logger.info(f"Successfully deleted sandbox {sandbox_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting sandbox {sandbox_id}: {str(e)}")
            raise

else:
    # ═══════════════════════════════════════════════════════
    # LOCAL DOCKER MODE (default)
    # ═══════════════════════════════════════════════════════
    logger.info("Using LOCAL DOCKER sandbox mode")

    from core.sandbox.docker_sandbox import (
        LocalDockerSandbox,
        create_local_sandbox,
        get_or_start_local_sandbox,
        delete_local_sandbox,
        SandboxState,
    )

    async def get_or_start_sandbox(sandbox_id: str) -> LocalDockerSandbox:
        """Retrieve a sandbox by ID, check its state, and start it if needed."""
        logger.info(f"Getting or starting local sandbox: {sandbox_id}")
        return await get_or_start_local_sandbox(sandbox_id)

    async def create_sandbox(password: str, project_id: str = None) -> LocalDockerSandbox:
        """Create a new sandbox with all required services configured and running."""
        logger.info("Creating new local Docker sandbox environment")
        sandbox = await create_local_sandbox(password, project_id)
        logger.info(f"Local sandbox created: {sandbox.id} ({sandbox.container_name})")
        return sandbox

    async def delete_sandbox(sandbox_id: str) -> bool:
        """Delete a sandbox by its ID."""
        logger.info(f"Deleting local sandbox: {sandbox_id}")
        return await delete_local_sandbox(sandbox_id)

    class _DaytonaCompat:
        """Compatibility shim so api.py can import 'daytona' regardless of mode."""

        async def get(self, sandbox_id: str) -> LocalDockerSandbox:
            return await get_or_start_local_sandbox(sandbox_id)

        async def stop(self, sandbox):
            import asyncio
            proc = await asyncio.create_subprocess_shell(
                f"docker stop {sandbox.container_name}",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            await asyncio.wait_for(proc.communicate(), timeout=30)

        async def start(self, sandbox):
            import asyncio
            proc = await asyncio.create_subprocess_shell(
                f"docker start {sandbox.container_name}",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            await asyncio.wait_for(proc.communicate(), timeout=30)

        async def delete(self, sandbox):
            await delete_local_sandbox(sandbox.id)

        async def create(self, params):
            password = "default"
            if hasattr(params, "env_vars") and params.env_vars:
                password = params.env_vars.get("VNC_PASSWORD", "default")
            project_id = None
            if hasattr(params, "labels") and params.labels:
                project_id = params.labels.get("id")
            return await create_local_sandbox(password, project_id)

    daytona = _DaytonaCompat()
