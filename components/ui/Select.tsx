import React from 'react';

interface Option {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Option[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className, ...props }, ref) => {
    return (
      <div className="mb-3">
        {label && (
          <label className="block text-sm font-medium text-black mb-1">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={`w-full border px-3 py-2 rounded text-black bg-white focus:outline-none focus:ring focus:border-blue-300 appearance-none ${error ? 'border-red-500' : 'border-gray-300'} ${className || ''}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
