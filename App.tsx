import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { TaxForm } from './components/TaxForm';
import { TaxResults } from './components/TaxResults';
import { TaxChart } from './components/TaxChart';
import { DEFAULT_VALUES, runSimulation } from './utils/taxEngine';
import { TaxInputs, SimulationResult } from './types';
import { FileText } from 'lucide-react';

const App: React.FC = () => {
  const [inputs, setInputs] = useState<TaxInputs>(DEFAULT_VALUES);
  const [results, setResults] = useState<SimulationResult | null>(null);

  // Exécuter la simulation à chaque changement d'input
  useEffect(() => {
    const res = runSimulation(inputs);
    setResults(res);
  }, [inputs]);

  const handleInputChange = (field: keyof TaxInputs, value: any) => {
    setInputs(prev => ({ ...prev, [field]: value }));
  };

  const handleReset = () => {
    // On réinitialise avec une copie fraîche des valeurs par défaut (Couple, 300k/150k...)
    setInputs({ ...DEFAULT_VALUES });
    // On remonte en haut de page pour voir le formulaire réinitialisé
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans text-slate-900">
      <Header title="Simulateur Impôt 2025" className="bg-white shadow-sm" />

      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          
          <div className="mb-8 text-center sm:text-left">
            <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Votre Simulation Fiscale</h1>
            <p className="text-slate-500">
                Calcul en temps réel basé sur les barèmes 2025 (revenus 2024), incluant le quotient familial, la décote et la CEHR.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
            
            {/* Colonne Gauche : Formulaire (5 cols) */}
            <div className="xl:col-span-5 space-y-6">
               <TaxForm 
                 inputs={inputs} 
                 onChange={handleInputChange} 
                 onReset={handleReset} 
               />
               
               {/* Details techniques pour mobile/desktop si besoin */}
               {results && (
                 <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center space-x-2 mb-4 text-slate-800">
                        <FileText size={20} />
                        <h3 className="font-bold">Détails du Calcul</h3>
                    </div>
                    <ul className="space-y-2 text-xs font-mono text-slate-600 bg-slate-50 p-4 rounded-lg overflow-y-auto max-h-64">
                        {results.details.map((line, idx) => (
                            <li key={idx} className="border-b border-slate-200 pb-1 last:border-0">{line}</li>
                        ))}
                    </ul>
                 </div>
               )}
            </div>

            {/* Colonne Droite : Résultats & Graphs (7 cols) */}
            <div className="xl:col-span-7 space-y-6">
                {results && (
                    <>
                        <TaxResults results={results} />
                        <TaxChart 
                            bracketData={results.bracketData} 
                            qf={results.qf} 
                            parts={results.parts}
                            perSimulation={results.perSimulation}
                        />
                    </>
                )}
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default App;