'use client';

import { ConversationListItem } from '@/lib/types';

type StatusField = 'leadTemperature' | 'talkStatus' | 'courseDecision' | 'status';

interface Props {
  conversation: ConversationListItem;
  onChange: (field: StatusField, value: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

const temperatureOptions = [
  { value: 'HOT', label: 'Issiq' },
  { value: 'WARM', label: 'Iliq' },
  { value: 'COLD', label: 'Sovuq' },
];

const talkOptions = [
  { value: 'TALKED', label: 'Gaplashildi' },
  { value: 'NOT_TALKED', label: 'Gaplashilmadi' },
];

const courseOptions = [
  { value: 'WILL_WRITE', label: 'Kursga yoziladi' },
  { value: 'WILL_NOT_WRITE', label: 'Kursga yozilmaydi' },
];

const openOptions = [
  { value: 'OPEN', label: 'Ochiq' },
  { value: 'CLOSED', label: 'Yopiq' },
];

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function LeadStatusControls({
  conversation,
  onChange,
  disabled,
  compact = false,
}: Props) {
  return (
    <div
      className={`grid gap-3 ${
        compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      }`}
    >
      <SelectField
        label="Temperatura"
        value={conversation.leadTemperature}
        options={temperatureOptions}
        onChange={(value) => onChange('leadTemperature', value)}
        disabled={disabled}
      />
      <SelectField
        label="Gaplashish"
        value={conversation.talkStatus}
        options={talkOptions}
        onChange={(value) => onChange('talkStatus', value)}
        disabled={disabled}
      />
      <SelectField
        label="Kurs"
        value={conversation.courseDecision}
        options={courseOptions}
        onChange={(value) => onChange('courseDecision', value)}
        disabled={disabled}
      />
      <SelectField
        label="Holat"
        value={conversation.status}
        options={openOptions}
        onChange={(value) => onChange('status', value)}
        disabled={disabled}
      />
    </div>
  );
}
