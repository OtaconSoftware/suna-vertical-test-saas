/**
 * Site metadata configuration - SIMPLE AND WORKING
 */

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.breakit.dev';

export const siteMetadata = {
  name: 'Breakit',
  title: 'Breakit: AI-Powered QA Testing',
  description: 'Automated web application testing powered by AI. Provide a URL and testing specs — our AI agent navigates your site, tests user flows, and delivers a detailed QA report with screenshots.',
  url: baseUrl,
  keywords: 'QA, testing, automation, web testing, UI testing, E2E, bug detection, automated testing, AI testing, quality assurance',
};
