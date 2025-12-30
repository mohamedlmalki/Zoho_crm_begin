interface StatCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}

export default function StatCard({ title, value, description, icon, iconBg, iconColor }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 ${iconBg} rounded-lg flex items-center justify-center`}>
          <div className={iconColor}>
            {icon}
          </div>
        </div>
        <span className="text-muted-foreground text-sm">{title}</span>
      </div>
      <div className="text-3xl font-bold text-foreground mb-2">{value}</div>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
