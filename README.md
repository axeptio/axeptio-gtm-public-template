# Axeptio CMP Google Tag Manager Template

![Axeptio Logo](/assets/logo-axeptio.svg)
https://axept.io

Ce tag permet d'ajouter le SDK Axeptio dans votre conteneur Google Tag Manager.

Vous configurez : 
- Votre project ID
- Votre CookieVersion

En utilisant les variables, vous pouvez rendre dynamique la CookieVersion en fonction d'une variable du dataLayer, du Hostname ou autre.

## Axeptio Settings

Vous pouvez personnaliser les settings Axeptio

- Durée de vie du cookie
- Domaine du cookie
- Nom du dataLayer
- Url de transport (Server Side Tracking)

## Consent Mode V2

Le template Axeptio CMP permet de configurer le Google Consent Mode V2 avec la valeur par defaut.

Vous pouvez choisir la région ou laissez vide pour mettre ALL

Dans les champs granted et denied, ajoutez les purposes

- analytics_storage
- ad_storage
- ad_user_data
- ad_personalization

Exemple dans denied : analytics_storage,ad_storage,ad_user_data,ad_personalization

## Setup

- Ajoutez depuis la gallerie le template : https://tagmanager.google.com/gallery/#/owners/axeptio/templates/axeptio-gtm-public-template
- Dans la section Tags, ajoutez la balise Axeptio
- Configurez votre projetId et CookieVersion
- Configurez les AxeptioSettings
- Ajouter le trigger : Consent Initialisation
- Publiez votre projet, le widget est installé.

## Support

Si vous rencontrez des problématiques lors de l'installation de notre balise Google Tag Manager, vous pouvez envoyer un email sur : help@axeptio.eu

