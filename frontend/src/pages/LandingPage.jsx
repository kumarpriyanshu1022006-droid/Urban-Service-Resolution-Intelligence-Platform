import React from 'react';
import {
  Clock,
  BarChart3,
  ArrowRight,
  ShieldCheck,
  MapPin
} from 'lucide-react';
import Button from '../components/ui/Button';

import Badge from '../components/ui/Badge';

export default function LandingPage({ onNavigateDashboard, onNavigatePredict, apiHealth }) {
  return (
    <div className="min-h-screen bg-[#F5F3ED] text-[#252C29] flex flex-col justify-between">
      {/* Editorial Navbar */}
      <nav className="border-b border-[#DCDDD4] bg-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-[#254A40] border border-[#C59A52]/40 flex items-center justify-center text-[#F5F3ED] font-serif text-lg font-bold">
              U
            </div>
            <div>
              <span className="font-semibold text-sm tracking-tight text-[#252C29]">
                Urban Resolution
              </span>
              <span className="hidden sm:inline text-xs text-[#68716A] ml-2 font-mono">
                Platform v3.0
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-xs text-[#68716A]">
              <span
                className={`w-2 h-2 rounded-full ${
                  apiHealth?.success ? 'bg-[#367454]' : 'bg-[#A66A25]'
                }`}
              />
              <span>{apiHealth?.success ? 'ML Service Active' : 'Connecting to API'}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={onNavigatePredict}
            >
              Try Prediction
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={onNavigateDashboard}
              icon={ArrowRight}
            >
              Open Dashboard
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-16 md:py-24 border-b border-[#DCDDD4] bg-gradient-to-b from-white to-[#F5F3ED]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Editorial Headline & Copy */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#ECEAE2] border border-[#DCDDD4] text-xs font-semibold text-[#254A40] uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5 text-[#254A40]" />
                <span>Municipal Decision Support System</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-normal font-serif text-[#252C29] leading-[1.08] tracking-tight">
                A clearer picture of municipal service requests.
              </h1>

              <p className="text-base sm:text-lg text-[#68716A] leading-relaxed max-w-2xl font-sans">
                Estimate resolution times, review complaint patterns, and understand where municipal service operations need attention with a practical, data-informed operations workspace.
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={onNavigateDashboard}
                  icon={ArrowRight}
                >
                  Open dashboard
                </Button>

                <Button
                  variant="secondary"
                  size="lg"
                  onClick={onNavigatePredict}
                >
                  Try a prediction
                </Button>
              </div>

              {/* Credibility bullet points */}
              <div className="pt-6 border-t border-[#DCDDD4] grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-[#68716A]">
                <div>
                  <span className="font-semibold text-[#252C29] block">LightGBM Regression</span>
                  <span>Trained on verified 311 closed case historical distributions</span>
                </div>
                <div>
                  <span className="font-semibold text-[#252C29] block">8.7 Hour Median MAE</span>
                  <span>Validated error rate across diverse urban complaint types</span>
                </div>
                <div>
                  <span className="font-semibold text-[#252C29] block">Zero Hallucination</span>
                  <span>Strict feature contracts without synthetic targets</span>
                </div>
              </div>
            </div>

            {/* Right Column: Realistic Product Preview Surface */}
            <div className="lg:col-span-5">
              <div className="bg-white border-2 border-[#254A40] rounded-xl shadow-lg p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#DCDDD4]">
                  <div>
                    <span className="text-[11px] font-semibold text-[#68716A] uppercase tracking-wider block">
                      Sample Prediction Preview
                    </span>
                    <span className="text-sm font-bold text-[#252C29]">
                      Dirty Conditions — Midtown
                    </span>
                  </div>
                  <Badge variant="muted">Illustrative Example</Badge>
                </div>

                <div className="p-4 bg-[#F5F3ED] rounded-lg border border-[#DCDDD4]">
                  <span className="text-xs text-[#68716A] block font-medium">Estimated Resolution Duration</span>
                  <div className="text-3xl font-bold text-[#254A40] tabular-nums mt-1">
                    50 hours 7 minutes
                  </div>
                  <span className="text-xs text-[#68716A] block mt-1">
                    2.08 calendar days • Expected completion Wednesday
                  </span>
                  <div className="mt-2.5 pt-2 border-t border-[#DCDDD4] text-[11px] text-[#8F6A2A] font-medium">
                    Illustrative sample scenario with fixed values — not a live model response.
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-[#ECEAE2]">
                    <span className="text-[#68716A]">Responsible Agency:</span>
                    <span className="font-semibold text-[#252C29]">DSNY (Sanitation)</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-[#ECEAE2]">
                    <span className="text-[#68716A]">Location Context:</span>
                    <span className="font-semibold text-[#252C29]">Sidewalk, District 3 Manhattan</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-[#ECEAE2]">
                    <span className="text-[#68716A]">Intake Channel:</span>
                    <span className="font-semibold text-[#252C29]">311 Online Portal</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-[#68716A]">Service Tier:</span>
                    <span className="font-semibold text-[#A85D3B]">Standard Turnaround (1–2 days)</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={onNavigatePredict}
                  className="w-full text-center"
                >
                  Configure Custom Scenario
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities Section */}
      <section className="py-16 max-w-7xl mx-auto px-6 w-full">
        <div className="max-w-2xl mb-12">
          <span className="text-xs font-semibold text-[#68716A] uppercase tracking-wider">
            Operational Capabilities
          </span>
          <h2 className="text-3xl font-serif font-normal text-[#252C29] mt-1">
            Engineered for practical municipal service oversight
          </h2>
          <p className="text-sm text-[#68716A] mt-2">
            Clear, grounded answers to workload prioritization questions across city agencies.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white border border-[#DCDDD4] rounded-lg p-5">
            <div className="w-9 h-9 rounded-md bg-[#254A40]/10 flex items-center justify-center text-[#254A40] mb-4">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-[#252C29] mb-1.5">
              Resolution-Time Estimation
            </h3>
            <p className="text-xs text-[#68716A] leading-relaxed">
              Calculates expected days and hours based on agency history, geographic density, and seasonal patterns without target leakage.
            </p>
          </div>

          <div className="bg-white border border-[#DCDDD4] rounded-lg p-5">
            <div className="w-9 h-9 rounded-md bg-[#A85D3B]/10 flex items-center justify-center text-[#A85D3B] mb-4">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-[#252C29] mb-1.5">
              Complaint Pattern Analysis
            </h3>
            <p className="text-xs text-[#68716A] leading-relaxed">
              Categorizes incident types from street conditions to water maintenance, highlighting backlog anomalies across categories.
            </p>
          </div>

          <div className="bg-white border border-[#DCDDD4] rounded-lg p-5">
            <div className="w-9 h-9 rounded-md bg-[#C59A52]/15 flex items-center justify-center text-[#8F6A2A] mb-4">
              <MapPin className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-[#252C29] mb-1.5">
              Borough & District Comparisons
            </h3>
            <p className="text-xs text-[#68716A] leading-relaxed">
              Evaluates response velocity disparities between Manhattan, Brooklyn, Queens, Bronx, and Staten Island jurisdictions.
            </p>
          </div>

          <div className="bg-white border border-[#DCDDD4] rounded-lg p-5">
            <div className="w-9 h-9 rounded-md bg-[#367454]/10 flex items-center justify-center text-[#367454] mb-4">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-[#252C29] mb-1.5">
              Operational Decision Support
            </h3>
            <p className="text-xs text-[#68716A] leading-relaxed">
              Provides dispatch managers with actionable triage tiers rather than vague scores, facilitating rational crew allocation.
            </p>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-16 bg-[#ECEAE2]/50 border-y border-[#DCDDD4]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-xl mb-12">
            <span className="text-xs font-semibold text-[#68716A] uppercase tracking-wider">
              System Workflow
            </span>
            <h2 className="text-3xl font-serif font-normal text-[#252C29] mt-1">
              How resolution prediction operates
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white border border-[#DCDDD4] rounded-lg p-5">
              <span className="text-2xl font-serif font-bold text-[#254A40] block mb-2">01</span>
              <h4 className="text-sm font-semibold text-[#252C29] mb-1">Enter Request Details</h4>
              <p className="text-xs text-[#68716A] leading-relaxed">
                Provide intake features: complaint type, agency, location classification, and borough coordinates.
              </p>
            </div>

            <div className="bg-white border border-[#DCDDD4] rounded-lg p-5">
              <span className="text-2xl font-serif font-bold text-[#254A40] block mb-2">02</span>
              <h4 className="text-sm font-semibold text-[#252C29] mb-1">Submit to Model Pipeline</h4>
              <p className="text-xs text-[#68716A] leading-relaxed">
                FastAPI validates data, derives calendar attributes, and encodes features through the trained LightGBM pipeline.
              </p>
            </div>

            <div className="bg-white border border-[#DCDDD4] rounded-lg p-5">
              <span className="text-2xl font-serif font-bold text-[#254A40] block mb-2">03</span>
              <h4 className="text-sm font-semibold text-[#252C29] mb-1">Review Time Estimate</h4>
              <p className="text-xs text-[#68716A] leading-relaxed">
                Receive discrete days, hours, and minutes along with operational turnaround guidelines.
              </p>
            </div>

            <div className="bg-white border border-[#DCDDD4] rounded-lg p-5">
              <span className="text-2xl font-serif font-bold text-[#254A40] block mb-2">04</span>
              <h4 className="text-sm font-semibold text-[#252C29] mb-1">Support Operational Review</h4>
              <p className="text-xs text-[#68716A] leading-relaxed">
                Correlate predictions against active borough workloads to identify emerging bottlenecks before delays compound.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Intended Audience / Designed For Operations */}
      <section className="py-16 max-w-7xl mx-auto px-6 w-full">
        <div className="bg-white border border-[#DCDDD4] rounded-xl p-8 md:p-12">
          <div className="max-w-2xl mb-8">
            <span className="text-xs font-semibold text-[#68716A] uppercase tracking-wider">
              Target Users
            </span>
            <h2 className="text-2xl sm:text-3xl font-serif font-normal text-[#252C29] mt-1">
              Designed for public-sector operations personnel
            </h2>
            <p className="text-sm text-[#68716A] mt-2 leading-relaxed">
              Built specifically for staff tasked with municipal service execution rather than theoretical modeling.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div className="p-4 bg-[#F5F3ED] rounded-lg border border-[#DCDDD4]">
              <span className="font-semibold text-sm text-[#252C29] block mb-1">Operations Supervisors</span>
              <p className="text-[#68716A] leading-relaxed">
                Assess expected turnaround for incoming batches and allocate field crews according to realistic closure horizons.
              </p>
            </div>

            <div className="p-4 bg-[#F5F3ED] rounded-lg border border-[#DCDDD4]">
              <span className="font-semibold text-sm text-[#252C29] block mb-1">311 Program Analysts</span>
              <p className="text-[#68716A] leading-relaxed">
                Monitor borough-level response velocity, cross-referencing predictive benchmarks against departmental SLA commitments.
              </p>
            </div>

            <div className="p-4 bg-[#F5F3ED] rounded-lg border border-[#DCDDD4]">
              <span className="font-semibold text-sm text-[#252C29] block mb-1">Inter-Agency Coordinators</span>
              <p className="text-[#68716A] leading-relaxed">
                Track issues requiring multi-agency collaboration (such as noise, street lighting, and sanitation overlaps).
              </p>
            </div>
          </div>

          {/* Contextual Operations Visual Surface */}
          <div className="mt-8 pt-8 border-t border-[#DCDDD4] overflow-hidden rounded-lg">
            <img
              src="/civic-operations.jpg"
              alt="Municipal operations coordination center with service telemetry displays"
              className="w-full h-64 sm:h-80 object-cover rounded-lg border border-[#DCDDD4]"
            />
            <p className="text-[11px] text-[#68716A] mt-2 italic text-center">
              Municipal operations room coordination: correlating predictive resolution estimates with active field telemetry.
            </p>
          </div>
        </div>
      </section>


      {/* Editorial Footer */}
      <footer className="border-t border-[#DCDDD4] bg-white py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center md:text-left">
            <p className="text-sm font-semibold text-[#252C29]">
              Urban Resolution Intelligence Platform
            </p>
            <p className="text-xs text-[#68716A]">
              Better visibility into every service request. All predictions are ML statistical estimates, not guaranteed deadlines.
            </p>
          </div>

          <div className="flex items-center gap-6 text-xs text-[#68716A]">
            <button
              type="button"
              onClick={onNavigateDashboard}
              className="hover:text-[#252C29] transition-colors cursor-pointer"
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={onNavigatePredict}
              className="hover:text-[#252C29] transition-colors cursor-pointer"
            >
              Estimate Time
            </button>
            <span className="text-[#DCDDD4]">|</span>
            <span className="font-mono text-[11px]">Model: LightGBM_L2</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
