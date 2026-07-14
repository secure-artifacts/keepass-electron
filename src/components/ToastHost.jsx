import React from 'react';
import Icon from './Icon.jsx';

export default function ToastHost({ toast }) {
  if (!toast) return null;
  const icon = toast.type === 'error' ? 'info' : toast.type === 'success' ? 'check' : 'info';
  return <div className={`toast toast--${toast.type || 'info'}`}><Icon name={icon} size={18}/><span>{toast.message}</span></div>;
}
