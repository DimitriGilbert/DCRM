import type { TranslationDict } from "../types";

/**
 * English (default) translation strings.
 * Keys use dot-notation namespacing.
 */
export const en: TranslationDict = {
  // --- Common ---
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.create": "Create",
  "common.search": "Search",
  "common.loading": "Loading…",
  "common.noResults": "No results found",
  "common.confirm": "Confirm",
  "common.back": "Back",
  "common.next": "Next",
  "common.skip": "Skip",
  "common.actions": "Actions",
  "common.close": "Close",
  "common.yes": "Yes",
  "common.no": "No",
  "common.or": "or",

  // --- Auth ---
  "auth.login": "Log in",
  "auth.logout": "Log out",
  "auth.signup": "Sign up",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.name": "Name",

  // --- Navigation ---
  "nav.dashboard": "Dashboard",
  "nav.clients": "Clients",
  "nav.leads": "Leads",
  "nav.projects": "Projects",
  "nav.tickets": "Tickets",
  "nav.settings": "Settings",

  // --- Dashboard ---
  "dashboard.title": "Dashboard",
  "dashboard.activeClients": "Active Clients",
  "dashboard.activeProjects": "Active Projects",
  "dashboard.openTickets": "Open Tickets",
  "dashboard.pipelineSummary": "Pipeline Summary",
  "dashboard.upcomingDeadlines": "Upcoming Deadlines",
  "dashboard.recentActivity": "Recent Activity",

  // --- Clients ---
  "clients.title": "Clients",
  "clients.create": "New Client",
  "clients.name": "Name",
  "clients.email": "Email",
  "clients.phone": "Phone",
  "clients.company": "Company",
  "clients.website": "Website",
  "clients.notes": "Notes",
  "clients.address": "Address",
  "clients.noClients": "No clients yet",

  // --- Leads ---
  "leads.title": "Leads",
  "leads.create": "New Lead",
  "leads.stage": "Stage",
  "leads.value": "Estimated Value",
  "leads.source": "Source",
  "leads.convert": "Convert to Client",
  "leads.noLeads": "No leads yet",

  // --- Projects ---
  "projects.title": "Projects",
  "projects.create": "New Project",
  "projects.status": "Status",
  "projects.budget": "Budget",
  "projects.startDate": "Start Date",
  "projects.endDate": "End Date",
  "projects.noProjects": "No projects yet",

  // --- Tickets ---
  "tickets.title": "Tickets",
  "tickets.create": "New Ticket",
  "tickets.type": "Type",
  "tickets.priority": "Priority",
  "tickets.dueDate": "Due Date",
  "tickets.noTickets": "No tickets yet",

  // --- Settings ---
  "settings.title": "Settings",
  "settings.locale": "Language",
  "settings.theme": "Theme",

  // --- Onboarding ---
  "onboarding.title": "Welcome to DCRM",
  "onboarding.language": "Choose your language",
  "onboarding.complete": "Get Started",
  "onboarding.step": "Step {current} of {total}",

  // --- General ---
  "app.name": "DCRM",
  "app.tagline": "Micro CRM for independent contractors",
} as const;
