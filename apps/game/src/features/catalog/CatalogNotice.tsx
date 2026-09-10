import type { GongLength } from '@zaliba/catalogs'
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
 *
 * **Depuis 003, une longueur de gong absente appelle le même geste** (FR-013).
 * Les deux états convergent volontairement : ne rien savoir et se savoir en
 * désaccord demandent la même prudence, puisque tout l'écran est dérivé. Le
 * message, lui, est **distinct** — ce ne sont pas les mêmes causes, ce ne sont
 * pas les mêmes remèdes, et un message qui parlerait de rééquilibrage là où le
 * serveur n'a simplement pas annoncé son rythme enverrait le lecteur enquêter
 * au mauvais endroit.
 */

export interface CatalogNoticeProps {
  /** La version annoncée par la réponse du serveur. */
  readonly fromServer: string | null | undefined
  /**
   * La longueur de gong annoncée. Absente, aucun chiffre dérivé n'est
   * affichable : le client ne sait pas à quel rythme le serveur bat, donc il ne
   * sait convertir aucune durée ni aucun taux.
   */
  readonly gong?: GongLength | null | undefined
  /** Injectable pour rendre le rechargement éprouvable sans naviguer. */
  readonly onReload?: () => void
  readonly children: ReactNode
}

export function CatalogNotice({ fromServer, gong, onReload, children }: CatalogNoticeProps) {
  const divergence = catalogDivergence(fromServer)

  /*
    L'absence de longueur passe **avant** la divergence de version, et l'ordre
    n'est pas indifférent : un serveur qui n'annonce pas son rythme est
    probablement antérieur à 003, donc sa version de catalogue diverge aussi.
    Annoncer le rééquilibrage plutôt que le rythme manquant enverrait enquêter
    sur la mauvaise cause.
  */
  if (divergence === null && (gong === null || gong === undefined)) {
    return (
      <div role="alert">
        <h1>Le rythme du serveur est inconnu</h1>
        <p>
          Ce serveur n’a pas annoncé la longueur de son gong — l’unité de temps avec laquelle il
          convertit les durées et les productions. Sans elle, aucune durée ni aucun taux ne peut
          être affiché sans risque d’être faux. Rechargez la page ; si le message revient, le
          serveur est plus ancien que ce client.
        </p>
        <button type="button" onClick={() => (onReload ?? defaultReload)()}>
          Recharger le jeu
        </button>
      </div>
    )
  }

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
