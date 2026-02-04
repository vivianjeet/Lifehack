import React from 'react';

function PrivacyPolicy() {
  const style: React.CSSProperties = {
    padding: '0 2rem', // Adds padding on the left and right
  };

  return (
    <div style={style}>
      <h1>Narad Muni Privacy Policy</h1>
      <p>Effective Date: 24-01-2026</p>
      <p>This Privacy Policy describes how [Your Company Name, or "Narad Muni App"] ("we," "us," or "our") collects, uses, and discloses information when you use our mobile application, Narad Muni (the "Service").</p>

      <h2>1. Information We Collect</h2>
      <p>We only collect information necessary to provide and improve the Service.</p>

      <h3>A. User-Provided Information (Prompts)</h3>
      <p>When you use our Service, we process the text input ("Prompts") you submit to generate responses.</p>
      <ul>
        <li>What is collected: The text, context, and selected model information associated with your request.</li>
        <li>Purpose: This information is necessary to deliver the core functionality of the Service, which is interacting with the AI models.</li>
      </ul>

      <h3>B. Technical and Usage Data</h3>
      <p>When you use the Service, we automatically collect certain technical information:</p>
      <ul>
        <li>Device Information: Device identifiers, operating system version, and app version.</li>
        <li>Usage Data: Details about how you use the application, such as features accessed, models selected, and API usage frequency.</li>
        <li>Purpose: To monitor the performance of the Service, track API usage against quotas, and diagnose errors (e.g., crashes, 503 errors).</li>
      </ul>

      <h2>2. How We Use and Share Information</h2>
      <h3>A. Sharing with Google's AI Services</h3>
      <p>The core functionality of Narad Muni relies on third-party AI models.</p>
      <ul>
        <li>Third Party: Google LLC (Generative Language API/Gemini).</li>
        <li>Information Shared: Your text Prompts and model selection data are transmitted to Google's servers for processing and response generation.</li>
        <li>Purpose: To generate the AI output requested by the user. We recommend reviewing Google's own privacy policies regarding their AI services.</li>
      </ul>

      <h3>B. Internal Use</h3>
      <p>We use collected information for the following purposes:</p>
      <ul>
        <li>To operate and maintain the Service.</li>
        <li>To detect, prevent, and address technical issues.</li>
        <li>To track application versions and usage patterns (via Google Play or Firebase Analytics).</li>
      </ul>

      <h2>3. Data Storage and Retention</h2>
      <ul>
        <li>Local Storage: We use a local database (Room) on your device to cache model names and other non-sensitive configuration data. This data is not transmitted to our servers.</li>
        <li>Cloud Storage (Firestore): We use Google Cloud Firestore to store a list of available AI models and potentially other configuration settings necessary for the app's functionality. We do not store personal user prompt history in our cloud database unless explicitly stated otherwise.</li>
        <li>Retention: We retain usage data for as long as necessary to fulfill the purposes outlined in this policy, unless a longer retention period is required by law.</li>
      </ul>

      <h2>4. Security</h2>
      <p>We take reasonable measures to protect your information from unauthorized access, loss, or misuse. However, no internet transmission is 100% secure.</p>

      <h2>5. Children's Privacy</h2>
      <p>The Service is not intended for use by children under the age of 13. We do not knowingly collect personally identifiable information from children under 13.</p>

      <h2>6. Changes to This Privacy Policy</h2>
      <p>We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Effective Date" at the top.</p>

      <h2>7. Contact Us</h2>
      <p>If you have any questions about this Privacy Policy, please contact us at:</p>
      <p>lifehackworksdev@gmail.com</p>
    </div>
  );
}

export default PrivacyPolicy;
