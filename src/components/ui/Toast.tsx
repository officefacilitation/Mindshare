import React from 'react';
import { ToastMessage } from '../../lib/types';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center justify-between p-3.5 rounded-lg shadow-toast text-sm transition-all duration-200 animate-slide-up border ${
            toast.type === 'success'
              ? 'bg-[#1d1d1f] text-white border-status-success/30'
              : toast.type === 'error'
              ? 'bg-[#dc3545] text-white border-red-700'
              : 'bg-[#1d1d1f] text-white border-hairline'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-white shrink-0" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-primary-light shrink-0" />}
            <span className="font-normal leading-snug">{toast.message}</span>
          </div>
          <button
            onClick={() => onDismiss(toast.id)}
            className="text-white/70 hover:text-white ml-2 p-1 rounded hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
