'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Car, Gauge as GaugeIcon, Layers, Plus, ScrollText } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { fmtNum } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, SkeletonCards, Star, cn } from '@/components/ui';
import { VehicleDashboard } from '@/components/erp/extras';
import { ResourceList } from '@/components/erp/list';
import { BY_KEY } from '@erp/shared';

export default function PortalVehicles() {
  const { t, lang } = useT();
  const { me } = useAuth();
  const [v, setV] = useState('all');
  const list = useQuery({ queryKey: ['my-vehicles'], queryFn: () => api<{ data: any[] }>('/api/v1/r/vehicle', { query: { limit: 100 } }) });

  if (list.isLoading) return <SkeletonCards n={4} />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;

  const vehicles = list.data?.data ?? [];

  return (
    <div className="space-y-5">
      {/* Editorial Fleet Garage Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-navy bg-[#08162B] text-white shadow-[0_10px_28px_rgba(11,31,58,0.16)]">
        <img
          src="/images/login-hero.jpg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-y-0 end-0 hidden h-full w-[52%] object-cover object-[50%_46%] opacity-80 md:block rtl:-scale-x-100"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#08162B] via-[#08162B]/95 via-[52%] to-[#08162B]/20 rtl:bg-gradient-to-l" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#08162B]/70 via-transparent to-[#08162B]/35" />
        <Star className="pointer-events-none absolute -bottom-16 -start-10 text-gold opacity-[0.06]" size={190} />

        <div className="relative z-10 max-w-2xl px-6 py-7 sm:px-8 sm:py-8">
          <div className="inline-flex items-center gap-1.5 rounded-xs border border-gold/30 bg-navy-light/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-gold">
            <Car size={12} />
            <span>{t('Fleet garage')} · {vehicles.length} {t('Vehicles')}</span>
          </div>

          <h1 className="mt-3.5 text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">
            {t('Vehicles & expenses')}
          </h1>
          <p className="mt-1.5 max-w-lg text-small leading-relaxed text-onnavy-secondary">
            {t('Spend, maintenance history and upcoming service needs per vehicle or for the whole fleet.')}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Link href="/portal/request/new">
              <Button variant="accent" size="sm" className="!h-9 gap-1.5 !px-4 shadow-[0_4px_14px_rgba(214,161,58,0.28)]">
                <Plus size={14} />
                <span>{t('Request parts by VIN')}</span>
              </Button>
            </Link>
            <Link href="/portal/statement">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-white/15 bg-white/[0.06] px-3.5 text-[13px] font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/[0.12]"
              >
                <ScrollText size={14} className="text-onnavy-secondary" />
                <span>{t('Statement of account')}</span>
              </button>
            </Link>
          </div>
        </div>
      </section>

      {vehicles.length === 0 ? (
        <Card>
          <EmptyState
            icon="car"
            title={t('No vehicles yet')}
            desc={t('Add a vehicle by creating a parts request with its VIN.')}
            action={
              <Link href="/portal/request/new">
                <Button size="sm">{t('New request')}</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {/* Adaptive Vehicle Passport Strip (1 vehicle) or Selectable Garage Grid (2+) */}
          {vehicles.length === 1 ? (
            (() => {
              const x = vehicles[0];
              const title = [x.make, x.model].filter(Boolean).join(' ') || x.plate || x.vin;
              return (
                <Card className="relative overflow-hidden border-gold-border/90 bg-gradient-to-r from-[#FFFDF7] via-white to-[#FBF5E6] shadow-[0_2px_10px_rgba(214,161,58,0.08)] before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:bg-gradient-to-r before:from-gold before:via-[#F3CD77] before:to-gold/25">
                  <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3.5">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-gold-light text-gold-text">
                        <Car size={20} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-[16px] font-extrabold text-navy">{title}</h2>
                          {x.year && <span className="num rounded-xs bg-card px-2 py-0.5 text-[11px] font-semibold text-strong ring-1 ring-line">{x.year}</span>}
                          {x.plate && <span className="mono rounded-xs bg-navy px-2 py-0.5 text-[11px] font-semibold text-gold">{x.plate}</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted">
                          {x.vin && <span className="mono text-[11.5px]">VIN {x.vin}</span>}
                          {x.mileage ? (
                            <span className="num inline-flex items-center gap-1 font-medium text-strong">
                              <GaugeIcon size={12} className="text-gold-text" />
                              <span>{fmtNum(x.mileage, lang, 0)} {t('km')}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Badge tone="success" dot>{t('Active')}</Badge>
                      <Link href="/portal/request/new">
                        <Button size="sm" variant="secondary" className="!h-9 gap-1.5 bg-card">
                          <span>{t('Request parts')}</span>
                          <ArrowUpRight size={13} className="rtl:-scale-x-100" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              );
            })()
          ) : (
            <section
              aria-label={t('Your fleet')}
              className={cn('grid gap-3', vehicles.length === 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4')}
            >
              <button
                type="button"
                onClick={() => setV('all')}
                className={cn(
                  'group flex flex-col justify-between rounded-md border p-4 text-start transition-all',
                  v === 'all'
                    ? 'border-gold bg-gradient-to-br from-[#FFFDF7] via-white to-[#FBF4E4] shadow-[0_6px_18px_rgba(214,161,58,0.12)]'
                    : 'border-line bg-card hover:border-gold-border'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('grid h-9 w-9 place-items-center rounded-sm', v === 'all' ? 'bg-gold-light text-gold-text' : 'bg-soft text-navy')}>
                    <Layers size={16} />
                  </span>
                  <Badge tone={v === 'all' ? 'gold' : 'muted'}>{vehicles.length}</Badge>
                </div>
                <div className="mt-3">
                  <p className="text-small font-bold text-navy">{t('Whole fleet')}</p>
                  <p className="mt-0.5 text-caption text-muted">{t('All vehicles combined')}</p>
                </div>
              </button>

              {vehicles.map((x: any) => {
                const selected = v === x.id;
                const title = [x.make, x.model].filter(Boolean).join(' ') || x.plate || x.vin;
                return (
                  <div
                    key={x.id}
                    onClick={() => setV(x.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setV(x.id);
                      }
                    }}
                    className={cn(
                      'group relative flex cursor-pointer flex-col justify-between rounded-md border p-4 text-start transition-all',
                      selected
                        ? 'border-gold bg-gradient-to-br from-[#FFFDF7] via-white to-[#FBF4E4] shadow-[0_6px_18px_rgba(214,161,58,0.12)]'
                        : 'border-line bg-card hover:border-gold-border hover:shadow-[0_6px_18px_rgba(11,31,58,0.05)]'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-sm', selected ? 'bg-gold-light text-gold-text' : 'bg-soft text-navy')}>
                        <Car size={17} />
                      </span>
                      <div className="flex items-center gap-1.5">
                        {x.year && <span className="num rounded-xs bg-card px-1.5 py-0.5 text-[11px] font-semibold text-strong ring-1 ring-line">{x.year}</span>}
                        {x.plate && <span className="mono rounded-xs bg-navy px-2 py-0.5 text-[11px] font-semibold text-gold">{x.plate}</span>}
                      </div>
                    </div>

                    <div className="mt-3">
                      <p className="truncate text-[14.5px] font-bold text-navy">{title}</p>
                      <p className="mono mt-0.5 truncate text-[11px] text-muted">{x.vin ? `VIN ${x.vin}` : x.plate ?? '—'}</p>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/70 pt-2.5 text-[11px]">
                      <span className="num inline-flex items-center gap-1 text-muted">
                        {x.mileage ? (
                          <>
                            <GaugeIcon size={11} />
                            <span>{fmtNum(x.mileage, lang, 0)} {t('km')}</span>
                          </>
                        ) : (
                          <span>{t('Active')}</span>
                        )}
                      </span>
                      <Link
                        href="/portal/request/new"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-0.5 font-semibold text-navy hover:text-gold-text"
                      >
                        <span>{t('Request parts')}</span>
                        <ArrowUpRight size={12} className="rtl:-scale-x-100" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          <VehicleDashboard
            url={v === 'all' ? `/api/v1/customers/${me?.customerId}/vehicle-dashboard` : `/api/v1/vehicles/${v}/dashboard`}
          />

          <ResourceList res={BY_KEY.Vehicle} embedded limit={10} />
        </>
      )}
    </div>
  );
}
