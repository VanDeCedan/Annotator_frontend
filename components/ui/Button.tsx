import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  asChild?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading,
  children,
  className,
  disabled,
  asChild,
  ...props
}: ButtonProps) {
  const base = "inline-flex items-center justify-center font-medium rounded transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1";

  const variants = {
    primary:   "bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-400",
    secondary: "bg-gray-500 hover:bg-gray-600 text-white focus:ring-gray-400",
    danger:    "bg-red-500 hover:bg-red-600 text-white focus:ring-red-400",
    ghost:     "bg-transparent hover:bg-gray-200 text-gray-700 hover:text-black",
    warning:   "bg-yellow-500 hover:bg-yellow-600 text-white focus:ring-yellow-400",
  };

  const sizes = {
    sm: "px-3 py-1 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-2.5 text-base",
  };

  const classes = [
    base,
    variants[variant],
    sizes[size],
    (disabled || isLoading) ? 'opacity-50 cursor-not-allowed' : '',
    className || '',
  ].join(' ');

  if (asChild) {
    return (
      <span className={classes}>
        {isLoading ? <Spinner /> : null}
        {children}
      </span>
    );
  }

  return (
    <button className={classes} disabled={disabled || isLoading} {...props}>
      {isLoading ? <Spinner /> : null}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
