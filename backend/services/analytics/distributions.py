"""Return distributions for Monte Carlo (numpy)."""

from __future__ import annotations

import numpy as np


def annual_returns(
    rng: np.random.Generator,
    n_paths: int,
    n_years: int,
    mean: float,
    std: float,
) -> np.ndarray:
    """Shape (n_paths, n_years) annual arithmetic returns."""
    return rng.normal(loc=mean, scale=std, size=(n_paths, n_years))


def inflate_path(base: float, inflation: float, years: int) -> np.ndarray:
    years_idx = np.arange(years + 1, dtype=float)
    return base * np.power(1.0 + inflation, years_idx)


def percentiles_by_year(paths: np.ndarray, ps=(10, 50, 90)) -> dict:
    """paths shape (n_paths, n_years+1) or (n_paths, n_years)."""
    out = {}
    for p in ps:
        out[f"p{p}"] = np.percentile(paths, p, axis=0).round(2).tolist()
    return out
