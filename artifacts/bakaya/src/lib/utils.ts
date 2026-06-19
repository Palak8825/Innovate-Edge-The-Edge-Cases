import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}

export function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "paid": return "bg-green-100 text-green-800 border border-green-200";
    case "overdue": return "bg-red-100 text-red-800 border border-red-200";
    case "escalating": return "bg-orange-100 text-orange-800 border border-orange-200";
    case "pending": return "bg-blue-100 text-blue-800 border border-blue-200";
    case "disputed": return "bg-purple-100 text-purple-800 border border-purple-200";
    default: return "bg-gray-100 text-gray-800 border border-gray-200";
  }
}

export function getStageColor(stage: string): string {
  switch (stage) {
    case "odr_ready": return "bg-red-100 text-red-800 border border-red-200";
    case "formal_demand": return "bg-orange-100 text-orange-800 border border-orange-200";
    case "tax_nudge": return "bg-yellow-100 text-yellow-800 border border-yellow-200";
    case "nudge": return "bg-blue-100 text-blue-800 border border-blue-200";
    case "none": return "bg-gray-100 text-gray-500 border border-gray-200";
    default: return "bg-gray-100 text-gray-500 border border-gray-200";
  }
}

export function getStageLabel(stage: string): string {
  switch (stage) {
    case "odr_ready": return "ODR Ready";
    case "formal_demand": return "Formal Demand";
    case "tax_nudge": return "Tax Nudge";
    case "nudge": return "Nudge";
    case "none": return "No Action";
    default: return stage;
  }
}

export function getLanguageLabel(lang: string): string {
  switch (lang) {
    case "ta": return "Tamil";
    case "hi": return "Hindi";
    case "en": return "English";
    default: return lang;
  }
}

export function getChannelLabel(channel: string): string {
  switch (channel) {
    case "whatsapp": return "WhatsApp";
    case "email": return "Email";
    case "system": return "System";
    default: return channel;
  }
}

export function getNextStage(current: string): string | null {
  const order = ["none", "nudge", "tax_nudge", "formal_demand", "odr_ready"];
  const idx = order.indexOf(current);
  if (idx < 0 || idx >= order.length - 1) return null;
  return order[idx + 1];
}
