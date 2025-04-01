<h1>
  <img src="https://axeptio.imgix.net/2024/07/e444a7b2-ea3d-4471-a91c-6be23e0c3cbb.png" alt="Descrizione immagine" width="80" style="vertical-align: middle; margin-right: 10px;" />
  Axeptio CMP Google Tag Manager Template
</h1>

This template allows you to easily integrate the **Axeptio SDK** into your **Google Tag Manager (GTM)** container for managing user consent. By leveraging this tag, you can ensure GDPR and ePrivacy compliance while providing a seamless user experience.

<br>

## 📑 Table of Contents

1. [Key Configuration Options](#key-configuration-options)
   - [Project ID and Cookie Version](#project-id-and-cookie-version)
   - [Axeptio Settings](#axeptio-settings)
   - [Consent Mode Configuration](#consent-mode-configuration)
   - [Region Selection](#region-selection)
2. [Installation Guide](#installation-guide)
   - [Step 1: Add the Template from the Gallery](#step-1-add-the-template-from-the-gallery)
   - [Step 2: Add the Axeptio Tag](#step-2-add-the-axeptio-tag)
   - [Step 3: Add the Trigger](#step-3-add-the-trigger)
   - [Step 4: Publish the Container](#step-4-publish-the-container)
3. [Support](#support)

<br><br>

## Key Configuration Options

### Project ID and Cookie Version
- **Project ID**: The unique identifier for your Axeptio project.
- **Cookie Version´**: The version of the cookies being used in your website or application. This can be dynamically set via a **dataLayer** variable, **Hostname**, or any other parameters you define.

### Axeptio Settings
You can configure several settings within the **Axeptio** template to align with your specific use case:
- **Cookie Lifespan**: Defines the duration of time a cookie remains active after the user consents.
- **Cookie Domain**: Specifies the domain on which the cookie will be valid.
- **DataLayer Name**: Customize the dataLayer name if you are using a custom dataLayer object.
- **Transport URL (Server-Side Tracking)**: Configure the transport URL to send consent data to a server-side endpoint for tracking purposes.
- **Consent Mode V2**: The template supports Google Consent Mode V2, which allows you to set consent states for different purposes, such as analytics, ads, etc.

### Consent Mode Configuration
With **Google Consent Mode V2**, you can set the following purposes:
- **analytics_storage**: Controls the consent for analytics-related cookies.
- **ad_storage**: Manages the consent for advertising cookies.
- **ad_user_data**: Defines consent for user data related to advertising.
- **ad_personalization**: Configures consent for personalized advertising cookies.

You can define multiple purposes in the granted and denied fields in this format:
`analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`.mnb.

###  Region Selection
You have the option to select the **region** where you want to apply the consent settings. If left blank, it will apply to all regions by default.

<br><br>
## 🚀Installation Guide

### Step 1: Add the Template from the Gallery
1. In your **Google Tag Manager** (GTM) container, go to the **Templates** section.
2. Search for the **Axeptio GTM Public Template** in the gallery and add it to your container.

### Step 2: Add the Axeptio Tag
1. In the **Tags** section of your GTM container, create a new tag.
2. Select the **Axeptio tag** template you just imported.
3. Configure the following parameters:
- **Project ID**: Enter your unique Axeptio project ID.
- **Cookie Version**: Define the Cookie Version for your setup (you can use a dataLayer variable to dynamically adjust this).
- **Axeptio Settings**: Customize additional settings such as Cookie Lifespan, Cookie Domain, and Transport URL if needed.

### Step 3: Add the Trigger
Set the **trigger** for the tag. The recommended trigger for this tag is _**Consent Initialization**, which ensures the tag is fired early in the user’s interaction flow.

### Step 4: Publish the Container
Once all configurations are set, **publish** your GTM container. The **Axeptio widget** will now be installed and ready for use.

<br><br> 

## 🛠Support
If you encounter any issues or need assistance with the Axeptio GTM tag, please reach out to our support team: help@axeptio.eu

- [English Support](https://support.axeptio.eu/hc/en-gb)

- [French Support](https://support.axeptio.eu/hc/en-gb)

<br><br> 
This version improves the overall flow of the document, providing clearer, step-by-step instructions for implementing the Axeptio Client template in **Google Tag Manager**, while also adding more technical details for advanced configurations. Let me know if you need further tweaks!
