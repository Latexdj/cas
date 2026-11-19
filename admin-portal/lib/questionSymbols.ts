// Symbols and shapes offered by the question editors (Super Admin Past
// Questions here; the school server's test editor has the same list in
// teacher.html). They are ordinary characters, so every app can show them.
export const SYMBOL_GROUPS: { name: string; symbols: string[] }[] = [
  { name: 'Maths', symbols: ['±', '×', '÷', '=', '≠', '≈', '≡', '<', '>', '≤', '≥', '√', '∛', '∞', 'π', '°', '′', '″', '∠', '⊥', '∥', '△', '∑', '∫', '∂', '∆', '∝', '∴', '∵', '%', '‰', '½', '⅓', '⅔', '¼', '¾', '⅛', '²', '³', 'ⁿ', '⁻¹'] },
  { name: 'Sets and logic', symbols: ['∈', '∉', '⊂', '⊆', '⊃', '∪', '∩', '∅', 'ℕ', 'ℤ', 'ℚ', 'ℝ', '∀', '∃', '¬', '∧', '∨', '⇒', '⇔', 'ξ'] },
  { name: 'Greek', symbols: ['α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'ν', 'ρ', 'σ', 'τ', 'φ', 'ω', 'Γ', 'Δ', 'Θ', 'Λ', 'Σ', 'Φ', 'Ω'] },
  { name: 'Science', symbols: ['→', '⇌', '↑', '↓', '℃', '℉', 'K', 'Ω', 'µ', 'Å', '·', '•', '⁺', '⁻', '₀', '₁', '₂', '₃', '₄', 'ΔH'] },
  { name: 'Money and units', symbols: ['GH¢', '₵', '¢', '$', '£', '€', '₦', '¥', 'm²', 'm³', 'cm²', 'cm³', 'km/h', 'm/s', 'm/s²', 'kg', 'g', 'ml', 'l'] },
  { name: 'Arrows', symbols: ['←', '→', '↑', '↓', '↔', '↕', '⇐', '⇒', '⇑', '⇓', '↗', '↘', '↙', '↖', '⟶', '⟵'] },
  { name: 'Shapes', symbols: ['△', '▲', '▽', '▼', '□', '■', '▭', '▬', '○', '●', '◇', '◆', '◯', '⬠', '⬡', '☆', '★', '✓', '✗', '◐', '◑'] },
];
