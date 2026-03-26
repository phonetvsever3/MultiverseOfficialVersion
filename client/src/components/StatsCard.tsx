import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: string;
  className?: string;
}

export function StatsCard({ title, value, icon, trend, className }: StatsCardProps) {
  return (
    <div className={cn(
      "bg-card border border-white/5 rounded-2xl p-6 relative overflow-hidden group hover:border-white/10 transition-all duration-300",
      className
    )}>
      {/* Background Glow */}
      <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-all duration-500" />

      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <h3 className="mt-2 text-3xl font-bold font-display text-foreground tracking-tight">{value}</h3>
          {trend && (
            <p className="mt-1 text-xs font-medium text-green-500 flex items-center gap-1">
              {trend} <span className="text-muted-foreground">vs last month</span>
            </p>
          )}
        </div>
        <div className="p-3 bg-white/5 rounded-xl text-primary border border-white/5 group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
      </div>
    </div>
  );
}
