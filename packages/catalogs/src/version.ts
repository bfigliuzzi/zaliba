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
 *
 * **Un changement d'unité de déclaration en est un** (003) : aucune valeur de
 * jeu n'a bougé, mais la forme des données du catalogue a changé — les durées
 * sont en gongs, la production en grains par gong, et deux champs ont changé de
 * nom. Un client resté en cache lirait `demolitionSeconds` là où le catalogue
 * porte `demolitionGongs`, et R15 doit le voir. Le motif de R15 vaut d'ailleurs
 * ici dans sa forme la plus forte : le client ne peut plus rien dériver du
 * catalogue seul, puisqu'il lui faut désormais la longueur du gong du serveur.
 */
export const CATALOG_VERSION = '2026-08-30.1'
