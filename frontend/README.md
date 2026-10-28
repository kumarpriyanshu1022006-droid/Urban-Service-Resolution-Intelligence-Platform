# Urban Resolution Intelligence Platform — Frontend

A production-minded, human-centered public sector operations workspace designed for municipal operations supervisors, 311 program analysts, and field dispatch coordinators.

## Product Tagline & Identity
- **Tagline:** *"Better visibility into every service request."*
- **Supporting Narrative:** *"Estimate resolution times, review complaint patterns, and understand where municipal service operations need attention."*

---

## Architecture & Technology Stack

- **Framework:** React 19 + Vite 8
- **Styling:** Tailwind CSS v4 using the civic public-sector design palette
- **Typography:** Google Fonts:
  - Headings: `DM Serif Display`
  - Body & UI: `Public Sans`
  - Numerical metrics: `Public Sans` with tabular numerals enabled (`font-variant-numeric: tabular-nums`)
- **Visual & Component System:**
  - Icons: `lucide-react`
  - Data Visualizations: `recharts` (BarChart, ComposedChart, Horizontal Bar, Distribution Histograms)
  - HTTP Client: `axios` with centralized API layer and error formatting

### Civic Color Palette
| Token | HEX | Role |
|---|---|---|
| Primary | `#254A40` | Primary buttons, active navigation, key data metrics |
| Primary Dark | `#19352E` | Sidebar background, dark emphasis |
| Secondary | `#A85D3B` | Warm terracotta accents, delayed turnaround highlights |
| Accent | `#C59A52` | Selected highlights, warnings |
| Background | `#F5F3ED` | Main application background |
| Surface | `#FFFFFF` | Tables, form cards, dialogs |
| Surface Muted | `#ECEAE2` | Utility pills, secondary panel backgrounds |
| Text Primary | `#252C29` | Main headings and body text |
| Text Secondary | `#68716A` | Labels, supporting text, axis tick marks |
| Border | `#DCDDD4` | Subdued dividers and outlines |
| Success | `#367454` | Standard turnaround and positive status |
| Warning | `#A66A25` | Warning alerts and elevated review |
| Danger | `#B4483E` | Validation errors and urgent alerts |

---

## Application Structure

- **`src/pages/`**:
  - `LandingPage.jsx`: Public editorial presentation with vision, capabilities, workflow, and CTAs.
  - `Overview.jsx`: Operations overview dashboard with KPI metrics, resolution distributions, borough breakdowns, evidence-based insights, and recent activity logs.
  - `PredictResolution.jsx`: Dedicated resolution estimation workspace featuring real-time calls to the trained `LightGBM_L2` model via `/predict`.
  - `Complaints.jsx`: Filterable service complaint workspace with multi-attribute search (borough, category, status) and detail inspection modal.
  - `Analytics.jsx`: Analytical deep dive into category turnaround, borough response velocity, and weekly volume cycles.
  - `ModelInformation.jsx`: Machine learning pipeline specification, validation error benchmarks (MAE: 8.70 hrs, RMSE: 0.753 days, R²: 0.694), feature leakage prevention rules, and documented operational limitations.
- **`src/components/`**:
  - `layout/`: `Sidebar.jsx`, `TopBar.jsx`
  - `ui/`: `Button.jsx`, `Badge.jsx`, `Card.jsx`, `StatCard.jsx`, `Notice.jsx`, `Modal.jsx`
  - `charts/`: `ResolutionDistributionChart.jsx`, `CategoryWorkloadChart.jsx`, `BoroughComparisonChart.jsx`, `TemporalTrendChart.jsx`
  - `forms/`: `PredictionForm.jsx` (with exact model input features and 1-click operational scenario presets), `PredictionResultCard.jsx`
- **`src/services/`**:
  - `api.js`: Centralized Axios client integrating `GET /health`, `GET /`, and `POST /predict`.

---

## How to Run

### 1. Start the FastAPI Backend Server
From the project root:
```powershell
python -m uvicorn api.main:app --port 8000
```
API endpoints available:
- `GET /` — API metadata and model version
- `GET /health` — Service health and loaded model verification
- `POST /predict` — Resolution duration prediction

### 2. Start the Frontend Application
In a separate terminal, navigate to the `frontend/` directory:
```powershell
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Production Build
To create a production-optimized bundle:
```powershell
cd frontend
npm run build
```
Preview the production build:
```powershell
npm run preview
```
