import { TaxInputs, SimulationResult, TaxBracketData, PasResult } from '../types';

// Constantes
export const DEFAULT_VALUES: TaxInputs = {
    situation: 'Couple',
    children: 1,
    salary1: 30000,
    realExpenses1: 0,
    per1: 0,
    perCeiling1: 37094,
    salary2: 15000,
    realExpenses2: 0,
    per2: 0,
    perCeiling2: 37094,
    commonCharges: 0,
    reduction: 0
};

const TAX_BRACKETS = [
    { limit: 11497, rate: 0.00, sumFixed: 0.00, label: '0%', color: '#60a5fa' },
    { limit: 29315, rate: 0.11, sumFixed: 1264.67, label: '11%', color: '#34d399' },
    { limit: 83823, rate: 0.30, sumFixed: 6834.52, label: '30%', color: '#facc15' },
    { limit: 180294, rate: 0.41, sumFixed: 16055.05, label: '41%', color: '#f97316' },
    { limit: 999999999, rate: 0.45, sumFixed: 23266.81, label: '45%', color: '#dc2626' }
];

const FAMILY_PARTS_TABLE: Record<string, number[]> = {
    'Célibataire': [1, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5],
    'Couple': [2, 2.5, 3, 4, 5, 6, 7, 8, 9],
    'Veuf': [1.5, 2.5, 3, 4, 5, 6, 7, 8, 9]
};

const THRESHOLDS = {
    DEDUCTION_10_PERCENT_MAX: 14426,
    DEDUCTION_10_PERCENT_MIN: 504,
    PFQF_CEILING: 1791,
    PFQF_CEILING_RCV: 1993,
    DECOTE_SINGLE_MAX: 889,
    DECOTE_SINGLE_THRESHOLD: 1964,
    DECOTE_COUPLE_MAX: 1470,
    DECOTE_COUPLE_THRESHOLD: 3249,
    DECOTE_RATE: 0.4525,
    RECOUVREMENT_THRESHOLD: 61,
};

const CEHR_BRACKETS = [
    { situation: 'Célibataire', lower: 0, upper: 250000, rate: 0.00 },
    { situation: 'Célibataire', lower: 250000, upper: 500000, rate: 0.03 },
    { situation: 'Célibataire', lower: 500000, upper: Infinity, rate: 0.04 },
    { situation: 'Couple', lower: 0, upper: 500000, rate: 0.00 },
    { situation: 'Couple', lower: 500000, upper: 1000000, rate: 0.03 },
    { situation: 'Couple', lower: 1000000, upper: Infinity, rate: 0.04 }
];

// Fonctions utilitaires privées
function calculateDeduction(salary: number, realExpenses: number): number {
    if (salary === 0) return 0;
    const deduction10Pct = Math.min(salary * 0.10, THRESHOLDS.DEDUCTION_10_PERCENT_MAX);
    const finalDeduction10Pct = Math.max(deduction10Pct, THRESHOLDS.DEDUCTION_10_PERCENT_MIN);
    return Math.max(finalDeduction10Pct, realExpenses);
}

function getFamilyParts(situation: string, children: number): number {
    const numChildren = Math.floor(children); // Ensure integer
    if (situation === 'Veuf') {
        if (numChildren === 0) return 1.5;
        if (numChildren === 1) return 2.5;
        if (numChildren === 2) return 3.0;
        return 3.0 + (numChildren - 2);
    }
    const partsArray = FAMILY_PARTS_TABLE[situation] || FAMILY_PARTS_TABLE['Célibataire'];
    if (numChildren < partsArray.length) {
        return partsArray[numChildren];
    }
    const partsBase = (situation === 'Couple' ? 2 : 1.5);
    return partsBase + (numChildren - 1);
}

function calculateTaxBrut(rni: number, parts: number) {
    const qf = rni / parts;
    let taxBrutQF = 0;
    let prevLimit = 0;
    const details: string[] = [];
    const bracketData: TaxBracketData[] = [];
    let rniInBrackets = 0;
    let highestRate = 0;

    for (const bracket of TAX_BRACKETS) {
        const taxableAmount = Math.min(qf, bracket.limit) - prevLimit;
        if (taxableAmount > 0) {
            const taxInBracket = taxableAmount * bracket.rate;
            taxBrutQF += taxInBracket;
            details.push(`Tranche ${bracket.label} (${prevLimit.toFixed(0)}€ à ${bracket.limit > 900000 ? '∞' : bracket.limit.toFixed(0) + '€'}) : ${taxableAmount.toFixed(0)}€ * ${bracket.rate * 100}% = ${taxInBracket.toFixed(0)}€`);
            bracketData.push({
                label: bracket.label,
                rate: bracket.rate,
                amount: taxableAmount,
                color: bracket.color
            });
            rniInBrackets += taxableAmount;
            if (bracket.rate > highestRate) {
                highestRate = bracket.rate;
            }
        }
        prevLimit = bracket.limit;
        if (qf <= bracket.limit) break;
    }

    if (rniInBrackets <= 0) {
        bracketData.push({
            label: '0%',
            rate: 0,
            amount: 0,
            color: '#60a5fa'
        });
    }

    const totalTaxBrut = taxBrutQF * parts;
    return { tax: Math.max(0, totalTaxBrut), details, qf, bracketData, highestRate };
}

function applyPlafonnementQuotientFamilial(rni: number, totalParts: number, taxBrut: number, situation: string, childrenCount: number) {
    const isCouple = situation === 'Couple';
    const isVeuf = situation === 'Veuf';
    let baseParts = isCouple ? 2.0 : 1.0;
    
    if (isVeuf && childrenCount === 0) {
        baseParts = 1.5;
    }

    const partsAdvantage = totalParts - baseParts;
    const numHalfPartsToCap = partsAdvantage * 2;

    if (numHalfPartsToCap <= 0) {
        // En l'absence de plafonnement, on renvoie simplement undefined pour baseHighestRate, 
        // ou on pourrait recalculer, mais ce n'est pas nécessaire car non utilisé.
        return { tax: taxBrut, advantage: 0, cap: 0, isCapped: false, taxBeforeRCV: taxBrut, rcvReduction: 0, taxBase: taxBrut, baseHighestRate: 0 };
    }

    // Calcul de l'impôt avec les parts de base (sans les enfants)
    const { tax: taxBase, highestRate: baseHighestRate } = calculateTaxBrut(rni, baseParts);
    
    const fiscalAdvantage = taxBase - taxBrut;
    let capStandard = 0;
    let capTotal = 0;
    
    if (isVeuf && childrenCount > 0) {
        if (numHalfPartsToCap >= 1) {
            capTotal += THRESHOLDS.PFQF_CEILING_RCV;
            capStandard += THRESHOLDS.PFQF_CEILING;
        }
        const remainingHalfParts = numHalfPartsToCap - 1; 
        
        // Re-implementing strict logic from source:
        capTotal = 0;
        capStandard = 0;
        let totalHalfPartsProcessed = 0;
        if (numHalfPartsToCap >= 1) {
             capTotal += THRESHOLDS.PFQF_CEILING_RCV;
             capStandard += THRESHOLDS.PFQF_CEILING;
             totalHalfPartsProcessed = 1;
        }
        const rem = numHalfPartsToCap - totalHalfPartsProcessed;
        if(rem > 0) {
            capTotal += rem * THRESHOLDS.PFQF_CEILING;
            capStandard += rem * THRESHOLDS.PFQF_CEILING;
        }

    } else {
        capStandard = numHalfPartsToCap * THRESHOLDS.PFQF_CEILING;
        capTotal = capStandard;
    }

    let taxIfNoRCV = taxBrut;
    if (fiscalAdvantage > capStandard) {
        taxIfNoRCV = taxBase - capStandard;
        taxIfNoRCV = Math.max(0, taxIfNoRCV);
    }

    let finalTax = taxBrut;
    let isCapped = false;

    if (fiscalAdvantage > capTotal) {
        finalTax = taxBase - capTotal;
        isCapped = true;
    }
    finalTax = Math.max(0, finalTax);
    const rcvReduction = (isVeuf && childrenCount > 0) ? taxIfNoRCV - finalTax : 0;

    return {
        tax: finalTax,
        advantage: fiscalAdvantage,
        cap: capTotal,
        isCapped,
        taxBase,
        taxBeforeRCV: taxIfNoRCV,
        rcvReduction: Math.max(0, rcvReduction),
        baseHighestRate // On retourne le TMI du scénario de base
    };
}

function applyDecote(tax: number, situation: string) {
    const isCouple = situation === 'Couple';
    const maxDecote = isCouple ? THRESHOLDS.DECOTE_COUPLE_MAX : THRESHOLDS.DECOTE_SINGLE_MAX;
    const threshold = isCouple ? THRESHOLDS.DECOTE_COUPLE_THRESHOLD : THRESHOLDS.DECOTE_SINGLE_THRESHOLD;
    const rate = THRESHOLDS.DECOTE_RATE;

    if (tax <= 0) return { tax: 0, decote: 0 };
    if (tax > threshold) return { tax: tax, decote: 0 };

    const decoteTheorique = maxDecote - (rate * tax);
    const appliedDecote = Math.max(0, Math.min(decoteTheorique, tax));
    return { tax: tax - appliedDecote, decote: appliedDecote };
}

function calculateCEHR(rfr: number, situation: string): number {
    let cehr = 0;
    let situationToUse = situation;
    if (situation === 'Veuf') situationToUse = 'Célibataire';

    const brackets = CEHR_BRACKETS.filter(b => b.situation === situationToUse).sort((a, b) => a.lower - b.lower);

    for (const bracket of brackets) {
        const lowerLimit = bracket.lower;
        const upperLimit = bracket.upper;
        const rate = bracket.rate;

        if (rate > 0 && rfr > lowerLimit) {
            const taxableInBand = Math.min(rfr, upperLimit) - lowerLimit;
            cehr += taxableInBand * rate;
        }
    }
    return cehr;
}

function calculateIndividualTaxForPAS(netTaxableInput: number, realExpenses: number, deductibleShare: number, halfParts: number, situation: string, commonCharges = 0): number {
    const deduction = calculateDeduction(netTaxableInput, realExpenses);
    const netCategoriel = netTaxableInput - deduction;
    const rni = Math.max(0, netCategoriel - deductibleShare - (commonCharges / 2));
    const { tax: iBrut } = calculateTaxBrut(rni, halfParts);
    
    // Note: On passe 0 enfants ici car 'halfParts' contient déjà la part des enfants divisée par deux.
    // L'objectif est de vérifier le plafonnement sur cette moitié de QF.
    const pfqfResult = applyPlafonnementQuotientFamilial(rni, halfParts, iBrut, situation, 0);
    
    const decoteResult = applyDecote(pfqfResult.tax, situation);
    return decoteResult.tax;
}

function calculatePASTaux(taxFinalFoyer: number, netInput1: number, netInput2: number, realExpenses1: number, realExpenses2: number, per1: number, per2: number, totalParts: number, situation: string, commonCharges = 0): PasResult {
    const totalNetInput = netInput1 + netInput2;
    const tauxFoyer = totalNetInput > 0 ? (taxFinalFoyer / totalNetInput) * 100 : 0;

    if (totalNetInput <= 0 || taxFinalFoyer <= 0) {
        return { tauxFoyer, tauxD1: 0, tauxD2: 0 };
    }

    const deduc1 = calculateDeduction(netInput1, realExpenses1);
    const deduc2 = calculateDeduction(netInput2, realExpenses2);
    const netCat1 = netInput1 - deduc1 - per1 - (commonCharges / 2);
    const netCat2 = netInput2 - deduc2 - per2 - (commonCharges / 2);

    // Détermination du conjoint aux revenus les plus faibles
    const isD1Low = netCat1 <= netCat2;

    const lowInput = isD1Low ? netInput1 : netInput2;
    const lowRealExp = isD1Low ? realExpenses1 : realExpenses2;
    const lowPer = isD1Low ? per1 : per2;

    const halfParts = totalParts / 2;
    
    // IMPORTANT BOFiP : Pour le calcul fictif de l'impôt du conjoint faible (pour déterminer son taux),
    // on considère ses revenus propres et la moitié du QF.
    // Cela revient à simuler une imposition distincte.
    // Il faut donc appliquer les seuils (Décote) d'un célibataire (foyer distinct) et non ceux du couple.
    // Si on laisse 'Couple', la décote de couple s'applique sur un demi-revenu, ce qui écrase l'impôt fictif (souvent à 0).
    const taxLow = calculateIndividualTaxForPAS(lowInput, lowRealExp, lowPer, halfParts, 'Célibataire', commonCharges);

    let rateLow = (lowInput > 0) ? (taxLow / lowInput) * 100 : 0;
    
    // Le taux individualisé ne peut pas excéder le taux du foyer (sauf cas très particuliers non gérés ici)
    rateLow = Math.min(rateLow, tauxFoyer);

    const shareTaxLow = (rateLow / 100) * lowInput;
    const shareTaxHigh = Math.max(0, taxFinalFoyer - shareTaxLow);

    const highInput = isD1Low ? netInput2 : netInput1;
    const rateHigh = (highInput > 0) ? (shareTaxHigh / highInput) * 100 : 0;

    return {
        tauxFoyer,
        tauxD1: isD1Low ? rateLow : rateHigh,
        tauxD2: isD1Low ? rateHigh : rateLow
    };
}

// Fonction Publique Principale
export function runSimulation(inputs: TaxInputs): SimulationResult {
    const { situation, children, salary1, realExpenses1, per1, perCeiling1, commonCharges, reduction } = inputs;
    let { salary2, realExpenses2, per2, perCeiling2 } = inputs;

    // Reset D2 if not couple
    if (situation !== 'Couple') {
        salary2 = 0;
        realExpenses2 = 0;
        per2 = 0;
        perCeiling2 = 0;
    }

    const perDeducted1 = Math.min(per1, perCeiling1);
    const perDeducted2 = Math.min(per2, perCeiling2);

    const isPer1Capped = per1 > perCeiling1 && perCeiling1 > 0;
    const isPer2Capped = salary2 > 0 && per2 > perCeiling2 && perCeiling2 > 0;

    const deduction1 = calculateDeduction(salary1, realExpenses1);
    const deduction2 = calculateDeduction(salary2, realExpenses2);

    const globalGrossIncome = (salary1 + salary2) - (deduction1 + deduction2);
    const rni = globalGrossIncome - perDeducted1 - perDeducted2 - commonCharges;
    const rfr = globalGrossIncome; // Simplified RFR for this scope
    const parts = getFamilyParts(situation, children);

    const { tax: iBrut, details: taxDetails, qf, bracketData, highestRate } = calculateTaxBrut(rni, parts);
    
    const pfqfResult = applyPlafonnementQuotientFamilial(rni, parts, iBrut, situation, children);
    const iPFQF = pfqfResult.tax;

    // DETERMINATION DU TMI EFFECTIF :
    // Si le plafonnement s'applique, le gain marginal d'un euro supplémentaire est taxé selon le taux
    // du calcul de référence (sans les enfants), et non selon le taux du QF réduit par les enfants.
    const effectiveTmi = pfqfResult.isCapped ? pfqfResult.baseHighestRate : highestRate;

    const decoteResult = applyDecote(iPFQF, situation);
    const iNetDecote = decoteResult.tax;

    let finalTax = Math.max(0, iNetDecote - reduction);
    if (finalTax > 0 && finalTax < THRESHOLDS.RECOUVREMENT_THRESHOLD) {
        finalTax = 0;
    }

    const cehr = calculateCEHR(rfr, situation);
    const totalTax = finalTax + cehr;

    const pas = calculatePASTaux(finalTax, salary1, salary2, realExpenses1, realExpenses2, perDeducted1, perDeducted2, parts, situation, commonCharges);

    // PER Simulation Logic using EFFECTIVE TMI
    let perInvest = 0;
    let perSaving = 0;
    let perMessage = "";
    
    // Note: On utilise effectiveTmi ici. Si plafonné à 30% (effectiveTmi), même si le QF dit 11%,
    // l'économie réelle se fait à 30%.
    const lowerBracketIndex = TAX_BRACKETS.findIndex(b => b.rate === effectiveTmi) - 1;
    
    if (effectiveTmi === 0 || lowerBracketIndex < 0) {
        perMessage = "Votre imposition effective actuelle ne permet pas d'économie significative immédiate via un PER.";
    } else {
        const lowerBracket = TAX_BRACKETS[lowerBracketIndex];
        
        // Calcul du montant à investir pour changer de tranche.
        // Si plafonné, le calcul est plus complexe car il faut repasser sous le plafond ou changer la tranche de base.
        // Pour simplifier l'UX dans ce cas complexe, on propose d'investir pour baisser le RNI 'de base'.
        
        // On estime grossièrement la distance vers la tranche inférieure du barème effectif
        // Pour un calcul exact en cas de plafonnement, il faudrait inverser la formule du plafonnement, 
        // ce qui est lourd. On reste sur une estimation basée sur le TMI affiché.
        
        let targetLimit = lowerBracket.limit;
        
        // Si plafonné, le 'QF' qui détermine le taux est celui des parts de base
        const partsForTmi = pfqfResult.isCapped ? (situation === 'Couple' ? 2 : 1) : parts;
        const currentQfForTmi = rni / partsForTmi;
        
        const qfToInvest = currentQfForTmi - targetLimit;
        const rniToInvest = qfToInvest * partsForTmi;
        const potentialSaving = rniToInvest * effectiveTmi;
        
        perInvest = Math.max(0, Math.round(rniToInvest));
        perSaving = Math.max(0, Math.round(potentialSaving));
        
        const formatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
        perMessage = `TMI Effectif: ${(effectiveTmi * 100).toFixed(0)}%. Pour atteindre la tranche inférieure (${formatter.format(targetLimit)} de QF), l'effort d'épargne estimé est de :`;
    }

    return {
        rbg: globalGrossIncome,
        rni,
        rfr,
        parts,
        qf,
        finalTax,
        cehr,
        totalTax,
        tmi: effectiveTmi, // On retourne le TMI Effectif
        pas,
        details: taxDetails,
        bracketData,
        pfqf: {
            isCapped: pfqfResult.isCapped,
            advantage: pfqfResult.advantage,
            cap: pfqfResult.cap,
            taxBase: pfqfResult.taxBase,
            rcvReduction: pfqfResult.rcvReduction
        },
        perWarning: {
            isPer1Capped,
            isPer2Capped
        },
        perSimulation: {
            investAmount: perInvest,
            savingAmount: perSaving,
            message: perMessage
        }
    };
}