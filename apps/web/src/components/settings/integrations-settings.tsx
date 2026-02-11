'use client';

import { useState } from 'react';
import { 
  useServices, 
  useIntegrations, 
  useUpdateIntegration, 
  useDeleteIntegration,
  useTestIntegration,
  type ServiceInfo 
} from '@/hooks/use-integrations';
import { Button } from '@feedglow/ui';
import { motion, AnimatePresence } from 'framer-motion';
import { t } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { 
  ExternalLink, 
  Check, 
  Loader2, 
  Settings2,
  Trash2,
  TestTube,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export function IntegrationsSettings() {
  const confirmDialog = useConfirm();
  const { data: services = [], isLoading: servicesLoading } = useServices();
  const { data: integrations = [], isLoading: integrationsLoading } = useIntegrations();
  const updateIntegration = useUpdateIntegration();
  const deleteIntegration = useDeleteIntegration();
  const testIntegration = useTestIntegration();
  
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>({});
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message?: string } | null>>({});

  const isLoading = servicesLoading || integrationsLoading;

  const getIntegration = (serviceId: string) => 
    integrations.find(i => i.service === serviceId);

  const handleConfigChange = (serviceId: string, field: string, value: string) => {
    setConfigs(prev => ({
      ...prev,
      [serviceId]: {
        ...(prev[serviceId] || {}),
        [field]: value
      }
    }));
  };

  const handleSave = async (service: ServiceInfo) => {
    const config = configs[service.id] || {};
    const existing = getIntegration(service.id);
    
    await updateIntegration.mutateAsync({
      service: service.id,
      config: { ...(existing?.config || {}), ...config },
      enabled: true
    });
    
    setConfigs(prev => {
      const next = { ...prev };
      delete next[service.id];
      return next;
    });
  };

  const handleTest = async (serviceId: string) => {
    setTestResults(prev => ({ ...prev, [serviceId]: null }));
    try {
      const result = await testIntegration.mutateAsync(serviceId);
      setTestResults(prev => ({ ...prev, [serviceId]: result }));
    } catch {
      setTestResults(prev => ({ ...prev, [serviceId]: { success: false, message: t('settings.integrations.connectionFailed') } }));
    }
  };

  const handleDisconnect = async (serviceId: string) => {
    const ok = await confirmDialog({ message: t('settings.integrations.confirmDisconnect'), variant: 'danger', confirmText: t('common.confirm') }); if (ok) {
      await deleteIntegration.mutateAsync(serviceId);
    }
  };

  const handleToggle = async (serviceId: string, enabled: boolean) => {
    const existing = getIntegration(serviceId);
    if (existing) {
      await updateIntegration.mutateAsync({
        service: serviceId,
        enabled
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-6">
        <ExternalLink className="w-5 h-5 text-orange-500" />
        <h2 className="text-lg font-semibold">{t('settings.integrations.title')}</h2>
      </div>
      
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        {t('settings.integrations.desc')}
      </p>

      <div className="space-y-3">
        {services.map(service => {
          const integration = getIntegration(service.id);
          const isExpanded = expandedService === service.id;
          const currentConfig = configs[service.id] || {};
          const testResult = testResults[service.id];
          
          return (
            <motion.div
              key={service.id}
              className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden"
              layout
            >
              {/* Header */}
              <div 
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                onClick={() => setExpandedService(isExpanded ? null : service.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xl">
                    {service.icon}
                  </div>
                  <div>
                    <div className="font-medium">{service.name}</div>
                    <div className="text-sm text-zinc-500">{t(`settings.integrations.service.${service.id}.desc`) || service.description}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {integration?.enabled && (
                    <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                      <Check className="w-4 h-4" />
                      {t('settings.integrations.connected')}
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-zinc-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-zinc-400" />
                  )}
                </div>
              </div>

              {/* Expanded Config */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-zinc-200 dark:border-zinc-800"
                  >
                    <div className="p-4 space-y-4">
                      {/* Config Fields */}
                      {service.configFields.map((field: ServiceInfo['configFields'][number]) => (
                        <div key={field.name}>
                          <label className="block text-sm font-medium mb-1.5">
                            {field.label}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          <input
                            type={field.type === 'password' ? 'password' : 'text'}
                            placeholder={field.placeholder}
                            value={currentConfig[field.name] ?? integration?.config?.[field.name] ?? ''}
                            onChange={(e) => handleConfigChange(service.id, field.name, e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          />
                        </div>
                      ))}

                      {/* Enable Toggle */}
                      {integration && (
                        <div className="flex items-center justify-between py-2">
                          <span className="text-sm">{t('settings.integrations.enableIntegration')}</span>
                          <button
                            onClick={() => handleToggle(service.id, !integration.enabled)}
                            className={`relative w-11 h-6 rounded-full transition-colors ${
                              integration.enabled 
                                ? 'bg-orange-500' 
                                : 'bg-zinc-300 dark:bg-zinc-700'
                            }`}
                          >
                            <span 
                              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                integration.enabled ? 'left-6' : 'left-1'
                              }`}
                            />
                          </button>
                        </div>
                      )}

                      {/* Test Result */}
                      {testResult && (
                        <div className={`p-3 rounded-lg text-sm ${
                          testResult.success 
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}>
                          {testResult.success ? '✓ ' + t('settings.integrations.connectionSuccess') : '✗ ' + (testResult.message || t('settings.integrations.connectionFailed'))}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          onClick={() => handleSave(service)}
                          disabled={updateIntegration.isPending}
                          className="flex items-center gap-2"
                        >
                          {updateIntegration.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Settings2 className="w-4 h-4" />
                          )}
                          {t('settings.integrations.saveConfig')}
                        </Button>
                        
                        {integration && (
                          <>
                            <Button
                              variant="outline"
                              onClick={() => handleTest(service.id)}
                              disabled={testIntegration.isPending}
                              className="flex items-center gap-2"
                            >
                              {testIntegration.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <TestTube className="w-4 h-4" />
                              )}
                              {t('settings.integrations.testConnection')}
                            </Button>
                            
                            <Button
                              variant="outline"
                              onClick={() => handleDisconnect(service.id)}
                              disabled={deleteIntegration.isPending}
                              className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:border-red-300"
                            >
                              {deleteIntegration.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                              {t('settings.integrations.disconnect')}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {services.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          {t('settings.integrations.empty')}
        </div>
      )}
    </div>
  );
}
