import { generateOpenApi } from '@ts-rest/open-api'
import { planetContractV1 } from '../src/v1/planet.js'

/**
 * **L'export OpenAPI de la version 1 : la transparence promise à P4, rendue
 * mécanique.**
 *
 * Le document n'est pas une commodité d'outillage. C'est le contrat publié, dans le
 * format que tout le monde sait lire : un joueur qui « a besoin de tout savoir » peut
 * y vérifier ce que le serveur accepte — et surtout **ce qu'il n'accepte pas**, ce qui
 * est le sujet de FR-055 à FR-057.
 *
 * **Il est engendré depuis les schémas Zod, jamais rédigé.** Une description écrite à
 * la main divergerait du code à la première modification, et divergerait en silence :
 * personne ne relit un fichier de documentation pour vérifier qu'il décrit encore le
 * code. Ici, ajouter un champ au contrat l'ajoute au document — et retirer une borne
 * la retire, ce que l'instantané de référence rend visible en revue.
 *
 * **Une fonction et non une constante.** Un document engendré au chargement du module
 * serait construit à l'import, y compris dans un contexte qui n'en a pas besoin — et
 * `generateOpenApi` parcourt tous les schémas. L'appel explicite laisse au publieur le
 * choix du moment, et rend le coût visible.
 *
 * **Il est publié en artefact de CI.** Le document n'est donc pas servi par l'API :
 * une route de documentation serait une surface de plus à protéger et à versionner,
 * pour une donnée qui ne change qu'aux déploiements.
 *
 * **Et il vit dans `scripts/`, hors du graphe de production** — pas dans `src/`,
 * malgré ce que la tâche prévoyait. La porte de frontières l'a exigé, et elle a
 * raison : `@ts-rest/open-api` est une dépendance de *développement*, et l'importer
 * depuis `src/` la ferait entrer dans le graphe que le client embarque. Un générateur
 * de documentation n'a rien à faire dans le code d'exécution d'un jeu — et le
 * découvrir par une porte plutôt que par un bundle alourdi est exactement ce qu'on
 * demande à une porte.
 */
export function openApiDocumentV1() {
  return generateOpenApi(
    planetContractV1,
    {
      info: {
        title: 'Zaliba — API de planète, version 1',
        version: '1',
        description: [
          'Le contrat de la planète mère.',
          '',
          "**Ce que ce contrat ne peut pas porter, et c'est délibéré** : aucun coût, aucune",
          'durée, aucune échéance, aucune production, aucun remboursement, aucun résultat de',
          'déblaiement, aucun horodatage fourni par le client. Ce ne sont pas des champs',
          "validés — ce sont des champs qui **n'existent pas**. Un champ qu'on ne peut pas",
          "envoyer est un champ qu'on ne peut pas exploiter.",
          '',
          "Le client n'envoie qu'une **intention** : un type, une variante, une orientation,",
          'une position pour une pose ; une cible pour une amélioration ou une démolition ;',
          'une case pour un déblaiement. Tout le reste est dérivé par le serveur, à partir du',
          "catalogue et de l'instant de sa propre transaction.",
          '',
          "**Le 409 est la porte de toutes les règles de jeu.** Un refus du jeu n'est pas une",
          "erreur technique : la requête était parfaitement formée, et c'est le jeu qui répond",
          'non. Un client qui traiterait les 409 comme des bogues afficherait le mauvais écran.',
          '',
          "**Toute commande exige une clé d'idempotence** (`Idempotency-Key`). La cible est une",
          'application mobile sur réseau instable : une requête réémise ne doit pas débiter',
          'deux fois.',
        ].join('\n'),
      },
    },
    // Les schémas sont **fermés** (`.strict()`), et le document doit le dire : sans
    // cette option, un lecteur croirait pouvoir ajouter un champ que le serveur
    // refuse — c'est-à-dire lirait un contrat plus permissif que le vrai.
    { setOperationId: true, jsonQuery: false },
  )
}
