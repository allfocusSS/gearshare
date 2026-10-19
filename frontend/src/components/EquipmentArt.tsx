import type { Category } from '../services/types.ts'

/** Original inline linework; no remote images, logos or runtime font assets. */
export function EquipmentArt({ category, large = false }: { category: Category; large?: boolean }) {
  return <div className={`equipment-illustration art-${category.toLowerCase()}${large ? ' large' : ''}`} aria-hidden="true"><span className="illustration-orbit" /><svg viewBox="0 0 160 120" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {category === 'Cameras' && <><rect x="28" y="34" width="104" height="67" rx="12" /><path d="m48 34 10-15h34l11 15M112 45h9" /><circle cx="79" cy="67" r="24" /><circle cx="79" cy="67" r="15" /><path d="M40 31v-7h9" /></>}
    {category === 'Audio' && <><rect x="62" y="15" width="36" height="61" rx="18" /><path d="M49 54v7a31 31 0 0 0 62 0v-7M80 92v17m-18 0h36M67 29h26M66 38h28m-28 9h28" /></>}
    {category === 'Presentation' && <><rect x="25" y="29" width="111" height="63" rx="12" /><circle cx="102" cy="60" r="20" /><circle cx="102" cy="60" r="11" /><path d="M38 48h27m-27 9h27m-27 9h18m-20 26-4 12m91-12 4 12m-89-3h14m65 0h14" /></>}
    {category === 'Accessories' && <><rect x="52" y="20" width="56" height="37" rx="5" /><path d="M60 29h40m-40 8h40m-40 8h40M80 57v22m-8 0h16M80 79l-32 31m32-31 32 31M80 79v31m-38 0h13m51 0h13M70 16h20" /></>}
  </svg><span className="illustration-cross">+</span></div>
}
