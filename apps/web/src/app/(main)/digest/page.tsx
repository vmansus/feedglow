'use client';

import { t } from '@/lib/i18n';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { DailyDigest } from '@/components/digest/daily-digest';

export default function DigestPage() {
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  
  // Get dates for navigation (last 7 days)
  const dates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return date.toISOString().split('T')[0];
  });

  const currentIndex = selectedDate ? dates.indexOf(selectedDate) : 0;
  
  const goToPrevious = () => {
    if (currentIndex < dates.length - 1) {
      setSelectedDate(dates[currentIndex + 1]);
    }
  };

  const goToNext = () => {
    if (currentIndex > 0) {
      setSelectedDate(dates[currentIndex - 1]);
    } else if (selectedDate) {
      setSelectedDate(undefined); // Go to "today"
    }
  };

  return (
    <div className="h-full overflow-y-auto surface-base">
      <div className="max-w-3xl mx-auto p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Header with Navigation */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-[rgb(var(--text-primary))]">
              {t('digest.title')}
            </h1>
            
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevious}
                disabled={currentIndex >= dates.length - 1}
                className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title={t('digest.previousDay')}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 min-w-[140px] justify-center">
                <Calendar className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-medium">
                  {selectedDate 
                    ? new Date(selectedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    : t('digest.today')
                  }
                </span>
              </div>
              
              <button
                onClick={goToNext}
                disabled={!selectedDate || currentIndex <= 0}
                className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title={t('digest.nextDay')}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Date Pills */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedDate(undefined)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                !selectedDate
                  ? 'bg-orange-500 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {t('digest.today')}
            </button>
            {dates.slice(1).map(date => (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  selectedDate === date
                    ? 'bg-orange-500 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                {new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </button>
            ))}
          </div>

          {/* Digest Content */}
          <DailyDigest key={selectedDate || 'today'} date={selectedDate} />

          {/* Historical Digests List */}
          {!selectedDate && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold mb-4 text-[rgb(var(--text-primary))]">
                {t('digest.historicalDigests')}
              </h2>
              <div className="space-y-3">
                {dates.slice(1, 4).map(date => (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className="w-full p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-orange-300 dark:hover:border-orange-800 transition-colors text-left"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {new Date(date).toLocaleDateString(undefined, { 
                          month: 'long', 
                          day: 'numeric',
                          weekday: 'long'
                        })}
                      </span>
                      <ChevronRight className="w-5 h-5 text-zinc-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
