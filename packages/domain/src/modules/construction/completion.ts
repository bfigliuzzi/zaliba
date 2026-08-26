import type { ResourceId } from '@zaliba/catalogs'
import type { Catalogs } from '../../kernel/catalogs.js'
import { cumulativeCost } from '../../kernel/curves.js'
import type { Effect, ResourceAmount } from '../../kernel/effects.js'
import type { PlanetSnapshot, ScheduledWork } from '../../kernel/snapshot.js'

/**
 * Les effets d'un chantier **à son achèvement** — redérivés, jamais stockés.
 *
 * Une charge d'effets sérialisée en base deviendrait une **surface de
 * confiance** : il faudrait la valider à la relecture, puisqu'elle a pu être
 * écrite par une version antérieure du code ou modifiée par un chemin qu'on
 * n'anticipe pas. La redériver depuis la nature du chantier et l'instantané à
 * l'échéance la rend déterministe, recalculable et sans surface.
 *
 * Elle a une seconde vertu : les effets suivent le catalogue. Un rééquilibrage
 * s'applique aux chantiers en cours, au lieu de laisser vivre des promesses
 * chiffrées selon des règles qui n'existent plus.
 *
 * **Un module ne mute rien** (doc de stack § 5.3) : il retourne des effets que
 * le noyau applique.
 */
export function effectsOnCompletion(
  work: ScheduledWork,
  snapshotAtDue: PlanetSnapshot,
  catalogs: Catalogs,
): readonly Effect[] {
  switch (work.nature) {
    case 'build':
      return work.target.kind === 'build'
        ? [
            {
              kind: 'place-building',
              buildingId: work.id,
              typeId: work.target.typeId,
              variantId: work.target.variantId,
              orientation: work.target.orientation,
              anchor: work.target.anchor,
            },
          ]
        : []

    case 'upgrade': {
      const target = work.target
      if (target.kind !== 'building') return []
      const building = snapshotAtDue.buildings.find((b) => b.id === target.buildingId)
      return building === undefined
        ? []
        : [{ kind: 'set-building-level', buildingId: building.id, level: building.level + 1 }]
    }

    case 'demolish': {
      const target = work.target
      if (target.kind !== 'building') return []
      const building = snapshotAtDue.buildings.find((b) => b.id === target.buildingId)
      if (building === undefined) return []

      const refunded = refundOf(building.typeId, building.level, catalogs)
      const effects: Effect[] = [{ kind: 'remove-building', buildingId: building.id }]
      // Le remboursement **avant** le retrait serait faux d'un cheveu : c'est la
      // même transaction, mais l'ordre est ce qu'un lecteur de journal voit.
      if (refunded.length > 0) effects.push({ kind: 'credit-resources', amounts: refunded })
      return effects
    }

    case 'clear':
      return work.target.kind === 'cell' ? [{ kind: 'clear-cell', cell: work.target.cell }] : []
  }
}

/**
 * La part remboursée d'un bâtiment démoli (FR-046).
 *
 * Le coût cumulé est **dérivé** du niveau et de la courbe (R9), jamais stocké :
 * le stocker le rendrait faux au premier rééquilibrage, et faux en silence.
 * La fraction est appliquée en entiers, avec une troncature vers le bas — le
 * joueur ne peut pas récupérer plus qu'il n'a dépensé.
 */
function refundOf(typeId: string, level: number, catalogs: Catalogs): readonly ResourceAmount[] {
  const type = catalogs.buildings[typeId as keyof typeof catalogs.buildings]
  if (type === undefined) return []

  const amounts: ResourceAmount[] = []
  for (const [resourceId, curve] of Object.entries(type.cost)) {
    const spent = cumulativeCost(curve, level)
    const refunded = Math.floor((spent * type.refund.num) / type.refund.den)
    if (refunded > 0) amounts.push({ resourceId: resourceId as ResourceId, grains: refunded })
  }
  return amounts
}
