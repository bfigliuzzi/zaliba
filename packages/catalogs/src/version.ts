/**
 * L'identifiant de version du catalogue.
 *
 * Exposé dans chaque réponse pour que la divergence entre le client et le
 * serveur soit **détectable**, et non silencieuse (R15).
 *
 * Le motif est propre à l'architecture retenue : le client calcule ses aperçus
 * avec le **même code** que le serveur (R8), ce qui suppose le même catalogue.
 * Un client resté en cache après un rééquilibrage afficherait alors des coûts
 * exacts pour un monde qui n'existe plus — et le serveur refuserait des
 * commandes que l'interface annonçait comme valides, sans que rien n'explique
 * pourquoi. Comparer les versions transforme cette confusion en un message.
 *
 * Il se change **à chaque modification de valeur d'équilibrage**. C'est ce qui
 * en fait un compagnon de l'instantané d'équilibrage : le diff de l'un impose
 * de bouger l'autre, et la revue le voit.
 */
export const CATALOG_VERSION = '2026-08-26.1'
