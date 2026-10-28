import React from 'react';
import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { Cpu, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';


export default function ModelInformation({ apiHealth, onRefreshHealth, isRefreshingHealth }) {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-2 border-b border-[#DCDDD4]">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#68716A]">
          Architecture & Validation Specifications
        </span>
        <h1 className="text-2xl sm:text-3xl font-serif font-normal text-[#252C29] mt-0.5">
          Model specifications & governance
        </h1>
        <p className="text-xs sm:text-sm text-[#68716A] mt-1">
          Detailed technical parameters, preprocessing transformations, validation metrics, and operational boundaries for LightGBM_L2.
        </p>
      </div>

      {/* Live Service Health Banner */}
      <div className="bg-white border border-[#DCDDD4] rounded-lg p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              apiHealth?.success ? 'bg-[#367454]/10 text-[#367454]' : 'bg-[#A66A25]/10 text-[#A66A25]'
            }`}
          >
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#252C29]">
                Backend Service: {apiHealth?.success ? 'Active & Healthy' : 'Offline / Connecting'}
              </h3>
              <Badge variant={apiHealth?.success ? 'success' : 'warning'}>
                {apiHealth?.data?.status || 'Unknown'}
              </Badge>
            </div>
            <p className="text-xs text-[#68716A] mt-0.5">
              Endpoint: <code className="font-mono text-[11px]">http://127.0.0.1:8000/health</code> • Model Loaded: {apiHealth?.data?.model_loaded ? 'True' : 'False'}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onRefreshHealth}
          loading={isRefreshingHealth}
          icon={RefreshCw}
        >
          Check API Status
        </Button>
      </div>

      {/* Model Performance Evaluation Metrics */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-3">
          <h3 className="text-sm font-bold text-[#252C29]">
            Offline Validation Metrics (Holdout Evaluation Dataset)
          </h3>
          <span className="text-[11px] text-[#68716A]">
            Metrics reflect offline validation benchmarks, not live API measurements
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Offline Validation MAE"
            value="8.70"
            unit="hours"
            context="0.3624 decimal days (test holdout)"
            trend="Offline Benchmark"
            icon={CheckCircle2}
          />
          <StatCard
            label="Offline Validation RMSE"
            value="0.753"
            unit="days"
            context="18.08 hours RMSE (test holdout)"
            trend="Offline Benchmark"
            icon={ShieldCheck}
          />
          <StatCard
            label="Offline Validation R²"
            value="0.694"
            context="Explains 69.4% of duration variance"
            trend="Offline Benchmark"
            icon={TrendingUpIcon}
          />
          <StatCard
            label="Offline Negative Clips"
            value="218"
            unit="cases"
            context="Clipped at 0.0 days in validation set"
            trend="Guarantees non-negative times"
            icon={AlertTriangle}
          />
        </div>
      </div>

      {/* Pipeline Architecture Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          title="Pipeline Architecture & Preprocessing"
          subtitle="Two-stage scikit-learn Pipeline with automated imputation"
        >
          <div className="space-y-3 text-xs leading-relaxed text-[#252C29]">
            <div className="p-3 bg-[#F5F3ED] rounded-md border border-[#DCDDD4]">
              <span className="font-semibold block text-[#254A40] mb-1">
                Stage 1: ColumnTransformer Preprocessor
              </span>
              <ul className="list-disc list-inside space-y-1 text-[#68716A]">
                <li>
                  <strong>Categorical Features (12):</strong> Processed with <code className="font-mono text-[10px]">SimpleImputer(strategy='most_frequent')</code> followed by <code className="font-mono text-[10px]">OneHotEncoder(min_frequency=20, handle_unknown='ignore')</code>. Unseen categories are safely ignored without pipeline failure.
                </li>
                <li>
                  <strong>Numerical Features (6):</strong> Imputed with <code className="font-mono text-[10px]">SimpleImputer(strategy='median')</code>.
                </li>
              </ul>
            </div>

            <div className="p-3 bg-[#F5F3ED] rounded-md border border-[#DCDDD4]">
              <span className="font-semibold block text-[#254A40] mb-1">
                Stage 2: LightGBM Regressor (Level 2 Pipeline)
              </span>
              <p className="text-[#68716A]">
                Gradient boosted decision trees configured with 700 estimators, learning rate of 0.035, column subsampling ratio of 0.85, and L2 regularization (reg_lambda = 2.0).
              </p>
            </div>

            <div className="p-3 bg-[#F5F3ED] rounded-md border border-[#DCDDD4]">
              <span className="font-semibold block text-[#254A40] mb-1">
                Stage 3: Post-Processing & Conversion
              </span>
              <p className="text-[#68716A]">
                Raw regression outputs are constrained to <code className="font-mono text-[10px]">max(0.0, raw_prediction)</code>, converting decimal days into exact integer hours and minutes.
              </p>
            </div>
          </div>
        </Card>

        {/* Feature Leakage Prevention & Schema */}
        <Card
          title="Data Leakage Governance"
          subtitle="Strict exclusion of downstream post-intake attributes"
        >
          <div className="space-y-4 text-xs leading-relaxed">
            <p className="text-[#68716A]">
              To guarantee that estimates reflect only information known at ticket creation, all lifecycle attributes downstream of initial intake are strictly excluded during both model training and inference.
            </p>

            <div className="border border-[#DCDDD4] rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-[#ECEAE2] font-semibold text-[#252C29] border-b border-[#DCDDD4]">
                Strictly Excluded Target & Post-Intake Features:
              </div>
              <div className="p-3 bg-white space-y-1 text-[#B4483E] font-mono text-[11px]">
                <p>• Closed Date (Actual closure time)</p>
                <p>• Status (Ticket lifecycle progression)</p>
                <p>• Due Date (Administrative SLA target)</p>
                <p>• Resolution Days (Target outcome variable)</p>
              </div>
            </div>

            <div className="border border-[#DCDDD4] rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-[#ECEAE2] font-semibold text-[#252C29] border-b border-[#DCDDD4]">
                Derived Temporal Attributes (Parsed from Created Date):
              </div>
              <div className="p-3 bg-white space-y-1 text-[#254A40] font-mono text-[11px]">
                <p>• Created Hour (0–23)</p>
                <p>• Created Day (1–31)</p>
                <p>• Created Month (1–12)</p>
                <p>• Created DayOfWeek (0=Monday, 6=Sunday)</p>
                <p>• Project Issue Category (Derived category mapping)</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Operational Caveats & Documented Limitations */}
      <Card
        title="Operational Limitations & Practical Considerations"
        subtitle="Factors not captured in statistical historical regression"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs leading-relaxed text-[#68716A]">
          <div className="p-4 rounded-md border border-[#DCDDD4] bg-white">
            <h4 className="font-semibold text-[#252C29] mb-1">
              Weather & Episodic Surges
            </h4>
            <p>
              The model does not incorporate real-time meteorological forecasts or emergency declarations. Severe blizzards or tropical storms may cause systemic resolution delays across sanitation and transportation crews.
            </p>
          </div>

          <div className="p-4 rounded-md border border-[#DCDDD4] bg-white">
            <h4 className="font-semibold text-[#252C29] mb-1">
              Contractor & Subcontractor Queues
            </h4>
            <p>
              Complex capital issues (such as water main fractures or major street cave-ins) depend on external contractor procurement and permit issuance, introducing right-skewed tail distributions.
            </p>
          </div>

          <div className="p-4 rounded-md border border-[#DCDDD4] bg-white">
            <h4 className="font-semibold text-[#252C29] mb-1">
              Field Crew Staffing Fluctuations
            </h4>
            <p>
              Municipal staffing headcounts and shift transitions are not directly ingested. Predictions assume typical departmental workforce availability across historical baseline periods.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function TrendingUpIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}
