
# Urban Service Resolution Intelligence Platform

### Predictive Intelligence for Urban Service Requests

Resolution-Time Prediction · Spatial Analytics · Bottleneck
Detection

From reactive complaint management to predictive urban intelligence.

![Python](https://img.shields.io/badge/Python-3.x-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Model](https://img.shields.io/badge/Model-LightGBM-2E8B57?style=for-the-badge)
![Focus](https://img.shields.io/badge/Focus-Machine%20Learning%20%26%20Analytics-315C9B?style=for-the-badge)

**Priyanshu Kumar** · B.Tech CSE --- Artificial Intelligence & Machine
Learning
GLA University


------------------------------------------------------------------------

## Overview

The **Urban Service Resolution Intelligence Platform** is a
machine-learning and analytics project designed to estimate the expected
resolution duration of urban service requests and investigate patterns
that may indicate operational bottlenecks.

Urban service departments handle requests related to noise, parking,
water maintenance, street conditions, waste, street lighting, and other
civic issues. The time required to resolve a request can vary depending
on its characteristics, responsible agency, location, and other factors.

This project uses historical 311-style service-request data to:

-   Predict a request's expected resolution duration using regression.
-   Evaluate and compare machine-learning models.
-   Analyze features that influence the trained model's predictions.
-   Explore issue categories and geographic patterns.
-   Flag potential bottlenecks by comparing complaint volume with
    average resolution duration.

> **Current scope:** The implemented work focuses on the Python-based ML
> and analytics pipeline. A production web application, live API, SHAP
> explanations, and role-based operational dashboards are future
> development items unless implemented separately.

## At a Glance

  -----------------------------------------------------------------------
  Item                                Current project details
  ----------------------------------- -----------------------------------
  Problem domain                      Urban service-request resolution

  ML task                             Supervised regression

  Target variable                     `Resolution Days`

  Dataset used in experiments         100,000-row sample

  Usable records after target         69,545
  cleaning                            

  Selected relevant features          18

  Best reported model                 Tuned LightGBM Regressor

  Best reported R²                    0.6363

  Best reported MAE                   0.3957 days

  Best reported RMSE                  0.8135 days

  Main outputs                        Predictions, evaluation metrics,
                                      feature importance, issue analytics

  Current phase                       ML experimentation and analytics
  -----------------------------------------------------------------------

## The Problem

Traditional complaint-management workflows are often focused on
recording, routing, and reviewing service requests after they have been
submitted. Historical dashboards can show past request counts and
resolution times, but they may not estimate the likely duration of a new
request.

### Key challenges

1.  **Limited advance visibility:** Teams may not know how long a new
    request is likely to take.
2.  **High request volume:** Large numbers of complaints make manual
    review and prioritization difficult.
3.  **Fragmented analysis:** Request frequency, resolution duration, and
    geographic patterns may be studied separately.
4.  **Potential bottlenecks:** Categories with both high request volume
    and long resolution duration may be difficult to spot quickly.
5.  **Limited predictive support:** Historical reporting alone does not
    provide a request-level estimate based on multiple features.

### Problem statement

> How can historical urban service-request data be used to estimate
> resolution duration and identify issue-level or geographic patterns
> that may warrant operational attention?

## The Proposed Solution

The project transforms historical service-request data into a predictive
and analytical workflow. It prepares the data, trains regression models,
evaluates predictions, and uses feature and issue-level analytics to
investigate patterns.

### Workflow

``` text
Historical Service-Request Data
              |
              v
          Data Cleaning
              |
              v
      Target & Feature Engineering
              |
              v
      Missing-Value Handling
              |
              v
       Encoding & Scaling
              |
              v
          Train/Test Split
              |
              v
       Regression Experiments
              |
              v
      Tuned LightGBM Regressor
              |
              v
       Estimated Resolution Days
              |
              v
 Feature Importance & Issue Analytics
              |
              v
 Potential Bottleneck Indicators
```

### What the system currently helps investigate

-   How closely predicted resolution durations match actual durations.
-   Which features are important to the trained model.
-   Which issue categories receive many requests.
-   How average resolution duration differs across issue categories.
-   Whether geographic attributes contribute to predictive performance.

The project does **not** currently guarantee resolution dates, prove the
causes of delays, or automatically dispatch field staff.

## Dataset

The current experiments use a **100,000-row sample** from a 311-style
urban service-request dataset.

  Dataset stage                     Records / features
  ------------------------------- --------------------
  Initial sample                          100,000 rows
  Original columns                                  44
  Records after target cleaning                 69,545
  Selected relevant features                        18
  Training set                          55,636 records
  Test set                              13,909 records

These values describe the reported experiment, not necessarily the
complete source dataset.

### Target variable: `Resolution Days`

The target is derived from the creation and closure dates:

``` text
Resolution Days = Closed Date - Created Date
```

Records with missing or invalid target information and negative
resolution durations are excluded during target cleaning.

### Feature groups

  ---------------------------------------------------------------------------
  Group                   Examples                Purpose
  ----------------------- ----------------------- ---------------------------
  Service and complaint   Agency, agency name,    Describe the issue and
                          complaint type,         service context
                          descriptor/problem      
                          detail                  

  Location context        Location type, ZIP      Represent where a request
                          code, city, borough     occurred

  Administrative          Community board,        Represent
  geography               council district,       geographic/administrative
                          police precinct         areas

  Geographic coordinates  Latitude, longitude     Represent the request's
                                                  geographic position

  Intake channel          Open Data Channel Type  Represent how a request was
                                                  submitted

  Temporal                Created year, month,    Capture time-related
                          day, day of week        patterns
  ---------------------------------------------------------------------------

The final feature list must match the project notebook. For real-world
prediction, inputs must be available at the moment the prediction is
made.

## Data Preparation

The reported workflow includes the following steps:

1.  **Target engineering:** Calculate resolution duration from creation
    and closure dates.
2.  **Cleaning:** Remove rows without a valid target and filter invalid
    or negative durations.
3.  **Feature selection:** Retain relevant service, geographic, and
    temporal attributes.
4.  **Categorical imputation:** Represent missing categorical values as
    `Unknown`.
5.  **Numerical imputation:** Use median imputation for numerical
    values.
6.  **Categorical encoding:** Apply One-Hot Encoding.
7.  **Numerical scaling:** Use `StandardScaler` in the reported
    preprocessing workflow.
8.  **Train/test split:** Use the reported 80/20 split for model
    evaluation.

### Preventing data leakage

A model should only use information that would be available when a new
request is scored. Closure-derived values and fields that reveal later
processing stages can introduce data leakage. The final pipeline should
audit each feature for prediction-time availability and fit
preprocessing transformations on training data only.

## Machine-Learning Approach

This is a **supervised regression problem** because the model predicts a
continuous numerical target: resolution duration in days.

### Models evaluated

  -----------------------------------------------------------------------
  Model                               Role
  ----------------------------------- -----------------------------------
  Linear Regression                   Baseline model

  Ridge Regression                    Linear model with L2 regularization

  LightGBM Regression                 Gradient-boosted decision-tree
                                      model

  Tuned LightGBM Regression           Best reported model after
                                      hyperparameter experiments
  -----------------------------------------------------------------------

### Why LightGBM?

LightGBM builds an ensemble of decision trees through gradient boosting.
It can capture nonlinear relationships and interactions in structured
data, such as combinations of complaint type, agency, and geographic
attributes.

### Reported tuned configuration

  Parameter                                                           Value
  --------------------- ---------------------------------------------------
  `n_estimators`          1,192 (reported selected iteration/configuration)
  `learning_rate`                                                     0.025
  `num_leaves`                                                           63
  `max_depth`                                                            -1
  `min_child_samples`                                                    40
  `subsample`                                                          0.85
  `subsample_freq`                                                        1
  `colsample_bytree`                                                   0.85
  `reg_alpha`                                                           0.1
  `reg_lambda`                                                          1.5

Use the final notebook and saved model configuration as the source of
truth if implementation details change.

## Model Performance

The best reported evaluation results for the tuned LightGBM model are:

  ------------------------------------------------------------------------
  Metric                                      Result Interpretation
  --------------------- ---------------------------- ---------------------
  **R²**                                  **0.6363** Approximately 63.63%
                                                     of target variance is
                                                     explained on the
                                                     evaluated test set

  **MAE**                            **0.3957 days** Average absolute
                                                     error of
                                                     approximately 9.5
                                                     hours

  **RMSE**                           **0.8135 days** Root mean squared
                                                     error of
                                                     approximately 19.5
                                                     hours
  ------------------------------------------------------------------------

### Understanding the metrics

-   **R² (coefficient of determination):** Measures how much target
    variance is explained by the model on the evaluated data. It is
    **not classification accuracy**.
-   **MAE (Mean Absolute Error):** Measures the average absolute
    difference between actual and predicted resolution duration.
-   **RMSE (Root Mean Squared Error):** Gives more weight to larger
    prediction errors than MAE.

These metrics describe the reported test evaluation on the sampled
dataset. They do not guarantee identical performance on future data,
other cities, or a production deployment.

## Analytics and Findings

The current notebook work includes:

-   Resolution-time distribution analysis.
-   Complaint frequency and issue-category analysis.
-   Average resolution duration by issue category.
-   Actual-versus-predicted visualization.
-   LightGBM feature-importance analysis.
-   Feature-ablation experiments.
-   Geographic and issue-level exploration.
-   Complaint-volume versus average-resolution-time analysis.
-   A prediction function and model-saving/verification steps.

### Feature importance and geography

Reported important features include longitude, latitude, council
district, agency, intake channel, location type, and complaint-related
attributes.

A reported feature-ablation experiment produced these R² results:

  Experiment                                       R²
  ------------------------------------------ --------
  All features                                 0.6363
  Without coordinates                          0.6227
  Without coordinates and Council District     0.6175

This suggests that geographic features helped model performance on the
evaluated split. It does not prove that location itself causes delays.
Feature importance indicates model reliance, not causation.

### Potential bottleneck analysis

The project compares issue frequency with average resolution duration:

``` text
High Complaint Volume
          +
Longer Average Resolution Duration
          |
          v
Potential Bottleneck for Investigation
```

This helps flag categories for further review. It is a screening
indicator, not proof of the operational cause of delays. Understanding
root causes may require additional information such as staffing,
workload, resource availability, and case complexity.

## Technology Stack

### Used in the current ML/analytics workflow

  -----------------------------------------------------------------------
  Technology                          Purpose
  ----------------------------------- -----------------------------------
  Python                              Main programming language

  Pandas                              Data manipulation

  NumPy                               Numerical operations

  Scikit-learn                        Preprocessing, baseline models,
                                      splitting, and evaluation

  LightGBM                            Gradient-boosted regression

  Matplotlib / Seaborn                Data visualization and exploratory
                                      analysis

  Jupyter Notebook                    Experiments and analysis

  Joblib / Pickle                     Model-artifact persistence where
                                      used
  -----------------------------------------------------------------------

### Planned platform technologies

These are future development items unless they have been implemented
separately:

  Technology                Planned role
  ------------------------- -----------------------------------------------
  SHAP                      Global and individual prediction explanations
  FastAPI                   Model inference API
  React                     Interactive frontend
  Node.js / Express         Backend and application APIs
  MongoDB / MongoDB Atlas   Application data and prediction history
  Mapping library           Interactive maps and heatmaps
  Cloud hosting             Deployment of application components

## Architecture

### Current ML/analytics workflow

``` text
Historical Data
      |
      v
Python Data Processing
      |
      v
Cleaning & Feature Engineering
      |
      v
Preprocessing
      |
      v
Regression Model Training
      |
      v
Tuned LightGBM
      |
      +----------------------+
      |                      |
      v                      v
Evaluation Metrics     Feature Importance
      |                      |
      +-----------+----------+
                  |
                  v
       Issue & Bottleneck Analytics
```

### Proposed future application architecture

``` text
User
 |
 v
React Dashboard
 |
 v
Node.js / Express Backend
 |
 v
FastAPI Prediction Service
 |
 v
Fitted Preprocessing + LightGBM
 |
 v
Predicted Resolution Duration
 |
 +-------------------------+
 |                         |
 v                         v
Issue/Spatial Analytics  SHAP Explanations
 |                         |
 +------------+------------+
              |
              v
      Decision-Support Views

MongoDB / MongoDB Atlas: planned persistence layer
```

## Project Status

### Implemented in the current ML/analytics phase

-   Data cleaning and target engineering.
-   Feature selection and preprocessing experiments.
-   Train/test evaluation workflow.
-   Linear Regression and Ridge baselines.
-   LightGBM training and hyperparameter experiments.
-   Evaluation using R², MAE, and RMSE.
-   Feature-importance analysis.
-   Actual-versus-predicted visualization.
-   Issue/category analytics.
-   Potential bottleneck analysis.
-   Prediction function and model-artifact verification.

### Planned

-   Final prediction-time feature and leakage audit.
-   Reproducible production inference pipeline.
-   SHAP explanations.
-   FastAPI prediction endpoint.
-   Priority/risk scoring.
-   React dashboard.
-   Node.js/Express backend.
-   MongoDB integration.
-   Interactive geographic maps and heatmaps.
-   Broader validation and deployment.

## Getting Started

The commands below are a general starting point for the Python notebook
workflow. Exact notebook names, dataset paths, and artifact names depend
on the repository.

### Prerequisites

-   Python 3.x
-   pip
-   Git
-   Jupyter Notebook
-   Access to the dataset used by the notebook

### 1. Clone the repository

``` bash
git clone <YOUR_REPOSITORY_URL>
cd <YOUR_REPOSITORY_FOLDER>
```

Replace the placeholders with the actual repository URL and folder name.

### 2. Create a virtual environment

**Windows PowerShell:**

``` powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 3. Install dependencies

``` bash
python -m pip install --upgrade pip
pip install pandas numpy scikit-learn lightgbm matplotlib seaborn jupyter joblib
```

If a `requirements.txt` file exists in the repository, use the pinned
dependencies instead:

``` bash
pip install -r requirements.txt
```

### 4. Configure the dataset

Place the dataset where the notebook expects it or update the
data-loading path. The raw dataset is not included in this README. Large
datasets should generally not be committed to Git; document their source
and access instructions separately.

### 5. Launch Jupyter Notebook

``` bash
jupyter notebook
```

Open the project's notebook and execute cells in order. Check the
notebook for the expected dataset path, feature schema, and saved-model
filenames.

> **Reproducibility note:** The repository's code, dependency files, and
> saved artifacts are authoritative for exact setup details. These
> commands describe a typical environment, not a guarantee that every
> repository version uses identical paths.

## Running a Prediction

At a high level, the prediction workflow is:

``` text
Request Features
      |
      v
Fitted Preprocessing Pipeline
      |
      v
Trained LightGBM Model
      |
      v
Estimated Resolution Days
```

A deployed implementation must use the same fitted preprocessing
pipeline and feature schema as training. Incoming records should not be
encoded or scaled independently in a different way.

## Limitations and Responsible Interpretation

-   The current experiments use a 100,000-row sample, not necessarily
    the full source dataset.
-   Model performance depends on data quality, feature availability, and
    evaluation design.
-   Actual resolution duration may depend on factors not represented in
    the data, such as staffing, workload, resource availability,
    emergencies, and external events.
-   R² is not classification accuracy.
-   Feature importance does not establish causation.
-   Bottleneck analytics highlights patterns for investigation; it does
    not prove why delays occurred.
-   Predictions are estimates, not guaranteed completion dates or SLA
    commitments.
-   A final leakage audit and validation on broader and more recent data
    are required before operational use.
-   SHAP, APIs, the full-stack dashboard, risk scoring, and deployment
    are planned unless implemented separately.

## Future Roadmap

1.  Audit all features for prediction-time availability and leakage.
2.  Finalize a reproducible preprocessing-and-model pipeline.
3.  Add SHAP-based global and individual explanations.
4.  Expose predictions through a FastAPI service.
5.  Develop a documented priority/risk-scoring approach.
6.  Build a React dashboard and Node.js/Express backend.
7.  Integrate MongoDB for application data and prediction history.
8.  Add interactive geographic maps and heatmaps.
9.  Validate on broader and more recent data.
10. Deploy the integrated platform after testing.

## Frequently Asked Questions

### Is this a classification or regression project?

It is a **supervised regression project** because the target,
`Resolution Days`, is a continuous numerical value.

### Does R² = 0.6363 mean 63.63% accuracy?

No. R² is the coefficient of determination. It indicates that
approximately 63.63% of target variance was explained on the evaluated
test set.

### Why use LightGBM instead of only an average?

An average provides a historical summary. A regression model can use
multiple request attributes together to estimate resolution duration for
a specific request.

### Does the current project automatically dispatch staff?

No. The current scope is ML prediction and analytics. Automated dispatch
is not claimed as implemented.

### Is SHAP already implemented?

SHAP is planned future work unless it has been added separately. The
current reported explanation work includes feature importance.

### Does the model prove why a request is delayed?

No. It identifies predictive patterns, not causation. Root-cause
analysis requires further operational data and investigation.

## Author

**Priyanshu Kumar**\
B.Tech CSE --- Artificial Intelligence & Machine Learning\
GLA University

------------------------------------------------------------------------

::: {align="center"}
**Urban Service Resolution Intelligence Platform**\
*Turning historical service-request data into predictive insights for
more proactive urban service management.*
:::
