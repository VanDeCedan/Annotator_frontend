import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="mb-3">
        {label && (
          <label className="block text-sm font-medium text-black mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full border px-3 py-2 rounded text-black bg-white focus:outline-none focus:ring focus:border-blue-300 ${error ? 'border-red-500' : 'border-gray-300'} ${className || ''}`}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
