import React from 'react';
import { SimulationResult } from '../types';
import { AlertTriangle, Info } from 'lucide-react';

interface TaxResultsProps {
  results: SimulationResult;
}

const formatCurrency = (val: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
const formatPercent = (val: number) => new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val);

export const TaxResults: React.FC<TaxResultsProps> = ({ results }) => {
  return (
    <div className="space-y-8">
      
      {/* KPI Cards */}
      <section>
         <h2 className="text-2xl font-bold text-slate-800 mb-4">Résultats Clés</h2>
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
             <ResultCard label="Revenu Brut Global (RBG)" value={formatCurrency(results.rbg)} />
             <ResultCard label="Revenu Net Imposable (RNI)" value={formatCurrency(results.rni)} highlight />
             <ResultCard label="Revenu Fiscal Réf. (RFR)" value={formatCurrency(results.rfr)} />
             <ResultCard label="Parts Fiscales (QF)" value={results.parts.toFixed(1)} />
             <ResultCard label="Quotient Familial" value={formatCurrency(results.qf)} />
             <ResultCard label="TMI (Taux Marginal)" value={formatPercent(results.tmi)} color="text-red-600" />
         </div>
      </section>

      {/* Prélèvement à la Source */}
      <section className="bg-blue-50/50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-xl font-bold text-blue-800 mb-4">Prélèvement à la Source (PAS)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PasCard label="Taux Déclarant 1" value={formatPercent(results.pas.tauxD1/100)} />
            <PasCard label="Taux Déclarant 2" value={formatPercent(results.pas.tauxD2/100)} />
            <PasCard label="Taux Foyer" value={formatPercent(results.pas.tauxFoyer/100)} isMain />
        </div>
        <p className="text-xs text-blue-600 mt-2 italic flex items-center">
            <Info size={14} className="mr-1"/>
            Estimation basée sur l'individualisation des taux (méthode BOFiP).
        </p>
      </section>

      {/* Final Totals */}
      <section className="space-y-4">
        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-6 rounded-r-xl shadow-sm">
            <p className="text-sm font-medium text-emerald-700 uppercase tracking-wide">Impôt sur le Revenu Net</p>
            <p className="text-4xl font-extrabold text-emerald-900 mt-1">{formatCurrency(results.finalTax)}</p>
            <p className="text-sm text-emerald-600 mt-1">Après décote, plafonnement QF et réductions.</p>
        </div>

        {results.cehr > 0 && (
            <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-r-xl shadow-sm">
                <p className="text-sm font-medium text-red-700 uppercase tracking-wide">Contribution Hauts Revenus (CEHR)</p>
                <p className="text-3xl font-extrabold text-red-900 mt-1">{formatCurrency(results.cehr)}</p>
            </div>
        )}

        <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-xl text-center">
             <p className="text-lg font-bold text-yellow-800 mb-1">TOTAL À PAYER 2025</p>
             <p className="text-4xl font-black text-yellow-900">{formatCurrency(results.totalTax)}</p>
        </div>
      </section>

      {/* Warnings */}
      <div className="space-y-3">
        {results.pfqf.isCapped && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg flex items-start space-x-3">
                <AlertTriangle className="text-amber-600 flex-shrink-0 mt-1" size={20} />
                <div>
                    <p className="font-bold text-amber-800">Plafonnement du Quotient Familial Appliqué</p>
                    <p className="text-sm text-amber-700 mt-1">
                        L'avantage fiscal est plafonné à <strong>{formatCurrency(results.pfqf.cap)}</strong>. 
                        Sans ce plafond, l'avantage serait de {formatCurrency(results.pfqf.advantage)}.
                        {results.pfqf.rcvReduction > 0 && <span> Bonus veuvage appliqué : {formatCurrency(results.pfqf.rcvReduction)}.</span>}
                    </p>
                </div>
            </div>
        )}
        {(results.perWarning.isPer1Capped || results.perWarning.isPer2Capped) && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start space-x-3">
                 <AlertTriangle className="text-red-600 flex-shrink-0 mt-1" size={20} />
                 <div>
                    <p className="font-bold text-red-800">Plafond PER Dépassé</p>
                    <p className="text-sm text-red-700 mt-1">Certains versements PER dépassent le plafond déductible saisi. L'excédent n'est pas déduit.</p>
                 </div>
            </div>
        )}
      </div>

    </div>
  );
};

const ResultCard: React.FC<{ label: string; value: string; highlight?: boolean; color?: string }> = ({ label, value, highlight, color = 'text-slate-900' }) => (
    <div className={`p-4 rounded-lg border ${highlight ? 'bg-white border-slate-300 shadow-sm' : 'bg-slate-50 border-slate-200'}`}>
        <p className="text-xs text-slate-500 font-medium uppercase">{label}</p>
        <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
);

const PasCard: React.FC<{ label: string; value: string; isMain?: boolean }> = ({ label, value, isMain }) => (
    <div className={`p-4 rounded-lg text-center ${isMain ? 'bg-white border border-blue-300 shadow-sm' : 'bg-blue-100/50'}`}>
        <p className="text-xs text-slate-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-blue-900">{value}</p>
    </div>
);