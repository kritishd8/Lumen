import type { ConfigFieldKey, MeasurementSource } from '@/types';
import { useAppStore } from '@/app/store/useAppStore';

export function SourceBadge({ source }: { source: MeasurementSource }) {
  return (
    <span className={`badge badge--${source}`}>
      {source === 'user' ? 'yours' : source === 'estimated' ? 'estimated' : 'default'}
    </span>
  );
}

interface ConfigNumberFieldProps {
  label: string;
  field: ConfigFieldKey;
  value: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  source: MeasurementSource;
  hint?: string;
  wide?: boolean;
}

export function ConfigNumberField({
  label,
  field,
  value,
  unit,
  min,
  max,
  step = 0.1,
  source,
  hint,
  wide,
}: ConfigNumberFieldProps) {
  const updateConfigField = useAppStore((state) => state.updateConfigField);
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span className="field-label">
        {label}
        <SourceBadge source={source} />
      </span>
      <div className="input-group">
        <input
          className="input input--number"
          type="number"
          value={Number.isFinite(value) ? Number(value.toFixed(3)) : 0}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isFinite(next)) return;
            updateConfigField(field, next);
          }}
        />
        {unit && <span className="input-unit">{unit}</span>}
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="config-card">
      <div className="config-card-head">
        <div className="config-icon">{icon}</div>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="config-card-body">{children}</div>
    </section>
  );
}
