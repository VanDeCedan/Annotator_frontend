import React from 'react';

interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
}

export function Table<T>({ columns, data, isLoading, emptyMessage = "No data available" }: TableProps<T>) {
  if (isLoading) {
    return (
      <div className="w-full flex items-center justify-center py-16 bg-white border rounded">
        <svg className="animate-spin h-6 w-6 text-blue-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-full bg-white border text-black">
        <thead>
          <tr className="bg-gray-100">
            {columns.map((col, i) => (
              <th key={i} className="py-2 px-4 border text-black text-left text-sm font-semibold">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-gray-500 text-sm">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50 text-black">
                {columns.map((col, j) => (
                  <td key={j} className="py-2 px-4 border text-black text-sm">
                    {col.cell ? col.cell(row) : (row[col.accessorKey as keyof T] as any)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
