# Talmore product branding

Staff-facing and candidate-facing product copy uses **Talmore**, **Talmore AI** and **Talmore Signature**. This includes settings, authentication/setup screens, integration help, signing pages and generated certificates, email templates, notifications, API documentation titles and the assistant's product knowledge. Configured workspace names and logos take precedence where supported. Setup and fallback email headers no longer load the upstream wordmark. The default favicon is a Talmore T; configured career-page icons still take precedence.

Technical compatibility identifiers remain unchanged: package names, file/component identifiers, database values and migrations, OAuth scopes, cookie/storage keys, API headers, metrics, deployment variables and image repository names. Existing integration credentials and persisted documents are not rewritten. The legacy email sender-domain fallback is also retained; outbound email should use the configured workspace sender or `EMAIL_FROM`.

Previously delivered emails, signed PDFs, audit records, saved legal documents and custom templates keep their original contents. Updated defaults apply to newly generated content. Upstream license and attribution files remain in the repository.
