import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ExportFormat = 'json' | 'markdown' | 'csv';
export type ExportType = 'articles' | 'starred' | 'reading-history';

interface ExportOptions {
  type: ExportType;
  format?: ExportFormat;
  startDate?: string;
  endDate?: string;
  feedIds?: number[];
  categoryIds?: number[];
}

export function useExport() {
  return useMutation({
    mutationFn: async (options: ExportOptions) => {
      const { type, format = 'json', ...params } = options;
      const searchParams = new URLSearchParams();
      
      if (format) searchParams.set('format', format);
      if (params.startDate) searchParams.set('startDate', params.startDate);
      if (params.endDate) searchParams.set('endDate', params.endDate);
      if (params.feedIds?.length) searchParams.set('feedIds', params.feedIds.join(','));
      if (params.categoryIds?.length) searchParams.set('categoryIds', params.categoryIds.join(','));
      
      const url = `/export/${type}?${searchParams.toString()}`;
      const res = await api.get(url);
      
      if (!res.ok) throw new Error('Failed to export');
      
      // Get filename from Content-Disposition header or generate one
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = `feedglow-${type}-${new Date().toISOString().split('T')[0]}.${format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
      
      const blob = await res.blob();
      return { blob, filename };
    },
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
