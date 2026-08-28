import type { ReactNode } from 'react'
import { catalogDivergence } from '../../lib/catalogVersion.js'

/**
 * L'avertissement de divergence de catalogue (R15).
 *
 * **Ce composant ne se contente pas d'avertir : il retire le contenu dérivé.** Un
 * avertissement placé à côté de chiffres faux laisserait le joueur décider s'il croit
 * un nombre dont il n'a aucun moyen de juger — et il n'en a aucun, puisque tout
 * l'écran de planète est calculé localement depuis le catalogue embarqué (R8).
 *
 * C'est une décision inconfortable et assumée : un écran vide avec une explication
 * vaut mieux qu'un écran plein et faux. La conséquence pratique est douce — le
 * rechargement suffit, et le message le dit.
 *
 * **Le rechargement est proposé, jamais imposé** : recharger d'autorité perdrait la
 * frappe en cours, et pourrait boucler si la divergence venait d'un cache
 * intermédiaire que le rechargement ne vide pas.
 */

export interface CatalogNoticeProps {
  /** La version annoncée par la réponse du serveur. */
  readonly fromServer: string | null | undefined
  /** Injectable pour rendre le rechargement éprouvable sans naviguer. */
  readonly onReload?: () => void
  readonly children: ReactNode
}

export function CatalogNotice({ fromServer, onReload, children }: CatalogNoticeProps) {
  const divergence = catalogDivergence(fromServer)

  /*
    **Une enveloppe, et non un fragment** (FR-011, § 1.1 du contrat de 002).

    001 rendait `<>{children}</>` quand les versions concordent : rien dans le
    document ne disait alors que l'écran était *dedans*, et la propriété que FR-011
    énonce — « elle englobe l'écran entier, sans occuper de rang » — n'était
    vérifiable dans aucun sens. Un élément la rend constatable, et il ne coûte rien :
    il ne porte ni rôle, ni nom, ni rang parmi les blocs.
  */
  if (divergence === null) return <div data-enveloppe="catalogue">{children}</div>

  return (
    /*
      `role="alert"` et non `status` : la divergence interrompt l'usage du jeu, et
      c'est exactement ce qu'une alerte est faite d'annoncer. Un `status` poli serait
      lu après le reste, c'est-à-dire après que le joueur a cherché sa planète.
    */
    <div role="alert">
      <h1>Les règles ont changé</h1>
      <p>{divergence.message}</p>
      <button type="button" onClick={() => (onReload ?? defaultReload)()}>
        Recharger le jeu
      </button>
    </div>
  )
}

/**
 * Le rechargement réel, isolé pour que le composant reste éprouvable.
 *
 * `location.reload()` n'existe pas dans un test de rendu, et l'appeler par défaut
 * ferait échouer un test qui ne parle pas de navigation.
 */
function defaultReload(): void {
  if (typeof window !== 'undefined') window.location.reload()
}
