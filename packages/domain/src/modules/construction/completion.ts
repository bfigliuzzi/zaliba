import type { ResourceId } from '@zaliba/catalogs'
import type { Catalogs } from '../../kernel/catalogs.js'
import type { Effect } from '../../kernel/effects.js'
import { storageCaps } from '../../kernel/rates.js'
import type { PlanetSnapshot, ScheduledWork } from '../../kernel/snapshot.js'
import { clipRefund, grossRefund, type Room } from './demolish.js'

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

      const effects: Effect[] = [{ kind: 'remove-building', buildingId: building.id }]

      // **L'écrêtement porte sur le plafond d'après retrait**, et l'ordre des
      // effets le dit : retirer, puis rembourser. La distinction compte dès qu'on
      // démolit un entrepôt — le plafond baisse à l'instant du retrait, et
      // rembourser contre l'ancien créerait de la ressource au-delà de la capacité
      // que le joueur vient lui-même de supprimer.
      const refunded = clipRefund(
        grossRefund(building.typeId, building.level, catalogs),
        roomAfterRemoval(snapshotAtDue, building.id, catalogs),
      ).refund

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
 * La place disponible par ressource, **le bâtiment retiré**.
 *
 * Le retrait est simulé plutôt que déduit, parce que le plafond dépend des
 * bâtiments posés : c'est vrai de l'entrepôt depuis US7, et l'écrire ainsi dès
 * maintenant évite que la démolition d'un entrepôt plein ne rembourse contre une
 * capacité qui n'existe plus.
 *
 * Aucun instantané n'est muté : `storageCaps` reçoit une copie sans le bâtiment,
 * et c'est tout ce dont elle a besoin pour calculer un plafond.
 */
function roomAfterRemoval(
  snapshotAtDue: PlanetSnapshot,
  buildingId: string,
  catalogs: Catalogs,
): Readonly<Partial<Record<ResourceId, Room>>> {
  const without: PlanetSnapshot = {
    ...snapshotAtDue,
    buildings: snapshotAtDue.buildings.filter((one) => one.id !== buildingId),
  }
  const caps = storageCaps(without, catalogs)

  return Object.fromEntries(
    catalogs.resourceIds.map((resourceId) => [
      resourceId,
      { amount: snapshotAtDue.holdings[resourceId]?.amount ?? 0, cap: caps[resourceId] ?? 0 },
    ]),
  ) as Readonly<Partial<Record<ResourceId, Room>>>
}
