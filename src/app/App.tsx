import { HashRouter, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import { noteUsage } from "@/src/telemetry/usage";
import { AppShell } from "@/src/components/AppShell";
import { AuditComparePage } from "@/src/dashboard/AuditCompare";
import { AuditDomainsPage } from "@/src/dashboard/AuditDomains";
import { AuditNewPage } from "@/src/dashboard/AuditNew";
import { AuditPagesPage } from "@/src/dashboard/AuditPages";
import { AuditReportPage } from "@/src/dashboard/AuditReport";
import { AuditRunningPage } from "@/src/dashboard/AuditRunning";
import { AuditsPage } from "@/src/dashboard/Audits";
import { DiffPage } from "@/src/dashboard/DiffPage";
import { DomainDetailPage, DomainsPage } from "@/src/dashboard/Domains";
import { FollowingPage } from "@/src/dashboard/Following";
import { GlobalGraphPage } from "@/src/dashboard/GlobalGraph";
import { GraphPage } from "@/src/dashboard/GraphPage";
import { OverviewPage } from "@/src/dashboard/Overview";
import { ScansPage } from "@/src/dashboard/Scans";
import { SettingsPage } from "@/src/dashboard/Settings";
import { SiteDetailPage } from "@/src/dashboard/SiteDetail";
import { SitesPage } from "@/src/dashboard/Sites";
import { WatchingPage } from "@/src/dashboard/Watching";
import { ProPage } from "@/src/dashboard/Pro";
import { ClientReportPage } from "@/src/dashboard/ClientReport";
import { WelcomePage } from "@/src/dashboard/Welcome";

export function App() {
  useEffect(() => { noteUsage("product-opened"); }, []);
  return (
    <HashRouter>
      <Routes>
        <Route path="/graph/:scanId" element={<GraphPage />} />
        <Route path="/global" element={<GlobalGraphPage />} />
        <Route path="/watching" element={<WatchingPage />} />
        <Route path="/reports/:scanId" element={<ClientReportPage />} />
        <Route path="/reports/:scanId/compare/:fromId" element={<ClientReportPage />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/scans" element={<ScansPage />} />
          <Route path="/audits" element={<AuditsPage />} />
          <Route path="/audits/new" element={<AuditNewPage />} />
          <Route path="/audits/:auditId" element={<AuditReportPage />} />
          <Route path="/audits/:auditId/running" element={<AuditRunningPage />} />
          <Route path="/audits/:auditId/pages" element={<AuditPagesPage />} />
          <Route path="/audits/:auditId/domains" element={<AuditDomainsPage />} />
          <Route path="/audits/compare/:oldId/:newId" element={<AuditComparePage />} />
          <Route path="/sites" element={<SitesPage />} />
          <Route path="/sites/:siteId" element={<SiteDetailPage />} />
          <Route path="/diff/:fromId/:toId" element={<DiffPage />} />
          <Route path="/domains" element={<DomainsPage />} />
          <Route path="/domains/:domain" element={<DomainDetailPage />} />
          <Route path="/following" element={<FollowingPage />} />
          <Route path="/pro" element={<ProPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
