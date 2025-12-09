import "./StatsCard.css";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: string;
  subtitle?: string;
}

function StatsCard({ title, value, icon, subtitle }: StatsCardProps) {
  return (
    <div className="stats-card">
      <div className="stats-card__icon">{icon}</div>
      <div className="stats-card__content">
        <h3 className="stats-card__title">{title}</h3>
        <p className="stats-card__value">{value}</p>
        {subtitle && <span className="stats-card__subtitle">{subtitle}</span>}
      </div>
    </div>
  );
}

export default StatsCard;
