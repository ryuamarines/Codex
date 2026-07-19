"use client";

import type { LucideIcon } from "lucide-react";

export type PlannerNavigationOption<T extends string> = {
  value: T;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

type PlannerPanelTabsProps<T extends string> = {
  value: T;
  options: PlannerNavigationOption<T>[];
  onChange: (value: T) => void;
};

export function PlannerPanelTabs<T extends string>({ value, options, onChange }: PlannerPanelTabsProps<T>) {
  return (
    <div className="segmented-tabs" role="tablist">
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.value;
        return (
          <button
            key={option.value}
            className={active ? "segmented-tab segmented-tab-active" : "segmented-tab"}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
          >
            <Icon size={15} />
            <span>{option.label}</span>
            {option.badge ? <span className="segmented-badge">{option.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

type PlannerMobileNavProps<T extends string> = PlannerPanelTabsProps<T>;

export function PlannerMobileNav<T extends string>({ value, options, onChange }: PlannerMobileNavProps<T>) {
  return (
    <nav className="mobile-workspace-nav" aria-label="ワークスペース表示">
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.value;
        return (
          <button
            key={option.value}
            className={active ? "mobile-workspace-link mobile-workspace-link-active" : "mobile-workspace-link"}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(option.value)}
          >
            <span className="relative">
              <Icon size={19} />
              {option.badge ? <span className="mobile-workspace-badge">{option.badge}</span> : null}
            </span>
            <span>{option.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
