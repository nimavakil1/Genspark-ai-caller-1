const { query } = require('./database');

/**
 * Language Verification Service
 * Handles automatic language detection and agent switching for voice calls
 */
class LanguageVerificationService {
  constructor() {
    // Supported languages and their codes
    this.supportedLanguages = {
      'en': 'English',
      'fr': 'French',
      'nl': 'Dutch',
      'de': 'German',
      'es': 'Spanish',
      'it': 'Italian'
    };

    // Language detection confidence threshold
    this.confidenceThreshold = 0.7;
  }

  /**
   * Get all active agents with their supported languages
   */
  async getActiveAgents() {
    try {
      const result = await query(`
        SELECT id, name, description, system_prompt, voice_settings, supported_language
        FROM agents 
        WHERE is_active = true 
        ORDER BY name
      `);
      return result.rows;
    } catch (error) {
      console.error('Error fetching active agents:', error);
      throw error;
    }
  }

  /**
   * Get agents that support a specific language
   */
  async getAgentsByLanguage(languageCode) {
    try {
      const result = await query(`
        SELECT id, name, description, system_prompt, voice_settings, supported_language
        FROM agents 
        WHERE is_active = true 
        AND supported_language = $1
        ORDER BY name
      `, [languageCode]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching agents by language:', error);
      throw error;
    }
  }

  /**
   * Detect language from speech text using simple heuristics
   * In production, this should be replaced with a proper language detection service
   */
  detectLanguage(text) {
    if (!text || text.trim().length === 0) {
      return { language: 'unknown', confidence: 0 };
    }

    const normalizedText = text.toLowerCase();
    
    // Simple language detection patterns
    const patterns = {
      'fr': [
        /\b(bonjour|salut|merci|oui|non|je|tu|il|elle|nous|vous|ils|elles|que|qui|quoi|où|quand|comment|pourquoi|avec|dans|sur|pour|par|de|du|des|le|la|les|un|une|et|ou|mais|donc|car|ni|or)\b/g,
        /\b(français|france|paris|lyon|marseille|toulouse|bordeaux|lille|nice|nantes|strasbourg|rennes|grenoble|dijon)\b/g
      ],
      'nl': [
        /\b(hallo|dank|ja|nee|ik|jij|hij|zij|wij|jullie|zij|dat|die|wat|waar|wanneer|hoe|waarom|met|in|op|voor|door|van|het|de|een|en|of|maar|dus|want|noch|noch)\b/g,
        /\b(nederlands|nederland|amsterdam|rotterdam|den haag|utrecht|eindhoven|tilburg|groningen|almere|breda|nijmegen)\b/g
      ],
      'de': [
        /\b(hallo|danke|ja|nein|ich|du|er|sie|wir|ihr|sie|das|die|was|wo|wann|wie|warum|mit|in|auf|für|durch|von|der|das|die|ein|eine|und|oder|aber|also|denn|weder|noch)\b/g,
        /\b(deutsch|deutschland|berlin|münchen|hamburg|köln|frankfurt|stuttgart|düsseldorf|dortmund|essen|leipzig)\b/g
      ],
      'es': [
        /\b(hola|gracias|sí|no|yo|tú|él|ella|nosotros|vosotros|ellos|ellas|que|quien|qué|dónde|cuándo|cómo|por qué|con|en|sobre|para|por|de|del|el|la|los|las|un|una|y|o|pero|entonces|porque|ni)\b/g,
        /\b(español|españa|madrid|barcelona|valencia|sevilla|zaragoza|málaga|murcia|palma|las palmas|bilbao)\b/g
      ],
      'it': [
        /\b(ciao|grazie|sì|no|io|tu|lui|lei|noi|voi|loro|che|chi|cosa|dove|quando|come|perché|con|in|su|per|da|del|il|la|i|le|un|una|e|o|ma|quindi|perché|né)\b/g,
        /\b(italiano|italia|roma|milano|napoli|torino|palermo|genova|bologna|firenze|bari|catania)\b/g
      ],
      'en': [
        /\b(hello|hi|thanks|thank you|yes|no|I|you|he|she|we|they|that|who|what|where|when|how|why|with|in|on|for|by|of|the|a|an|and|or|but|so|because|nor)\b/g,
        /\b(english|england|london|manchester|birmingham|leeds|glasgow|sheffield|bradford|liverpool|edinburgh|bristol)\b/g
      ]
    };

    const scores = {};
    
    // Calculate scores for each language
    for (const [lang, langPatterns] of Object.entries(patterns)) {
      let totalMatches = 0;
      for (const pattern of langPatterns) {
        const matches = normalizedText.match(pattern);
        if (matches) {
          totalMatches += matches.length;
        }
      }
      scores[lang] = totalMatches;
    }

    // Find the language with the highest score
    const maxScore = Math.max(...Object.values(scores));
    const detectedLanguage = Object.keys(scores).find(lang => scores[lang] === maxScore);
    
    // Calculate confidence based on text length and matches
    const textLength = normalizedText.split(' ').length;
    const confidence = maxScore > 0 ? Math.min(maxScore / textLength * 2, 1) : 0;

    return {
      language: maxScore > 0 ? detectedLanguage : 'unknown',
      confidence: confidence,
      scores: scores
    };
  }

  /**
   * Verify if customer's language is confirmed and matches available agents
   */
  async verifyCustomerLanguage(customerId, detectedLanguage = null) {
    try {
      // Get customer's language status
      const customerResult = await query(`
        SELECT invoice_language_code, invoice_language_confirmed
        FROM customers 
        WHERE id = $1
      `, [customerId]);

      if (customerResult.rows.length === 0) {
        throw new Error('Customer not found');
      }

      const customer = customerResult.rows[0];
      const customerLanguage = customer.invoice_language_code || 'fr'; // Default to French
      const isConfirmed = customer.invoice_language_confirmed || false;

      // Get available agents for customer's language
      const availableAgents = await this.getAgentsByLanguage(customerLanguage);

      // Determine if language verification is needed
      let needsVerification = !isConfirmed;
      let suggestedLanguage = customerLanguage;

      // If we have detected language and it differs from customer's stored language
      if (detectedLanguage && detectedLanguage !== 'unknown' && detectedLanguage !== customerLanguage) {
        const detectedAgents = await this.getAgentsByLanguage(detectedLanguage);
        
        if (detectedAgents.length > 0) {
          needsVerification = true;
          suggestedLanguage = detectedLanguage;
        }
      }

      return {
        customerId,
        customerLanguage,
        detectedLanguage,
        suggestedLanguage,
        isConfirmed,
        needsVerification,
        availableAgents: availableAgents.length > 0 ? availableAgents : await this.getAgentsByLanguage('en'), // Fallback to English
        suggestedAgents: await this.getAgentsByLanguage(suggestedLanguage)
      };
    } catch (error) {
      console.error('Error verifying customer language:', error);
      throw error;
    }
  }

  /**
   * Update customer's confirmed language
   */
  async confirmCustomerLanguage(customerId, languageCode) {
    try {
      await query(`
        UPDATE customers 
        SET invoice_language_code = $1, invoice_language_confirmed = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [languageCode, customerId]);

      console.log(`✅ Customer ${customerId} language confirmed as ${languageCode}`);
      return true;
    } catch (error) {
      console.error('Error confirming customer language:', error);
      throw error;
    }
  }

  /**
   * Get the best agent for a customer based on language preference
   */
  async getBestAgentForCustomer(customerId, preferredLanguage = null) {
    try {
      const verification = await this.verifyCustomerLanguage(customerId, preferredLanguage);
      
      // Return the first available agent for the suggested language
      if (verification.suggestedAgents.length > 0) {
        return {
          agent: verification.suggestedAgents[0],
          languageVerification: verification,
          requiresLanguageConfirmation: verification.needsVerification
        };
      }

      // Fallback to any available agent
      if (verification.availableAgents.length > 0) {
        return {
          agent: verification.availableAgents[0],
          languageVerification: verification,
          requiresLanguageConfirmation: verification.needsVerification
        };
      }

      throw new Error('No suitable agent available');
    } catch (error) {
      console.error('Error getting best agent for customer:', error);
      throw error;
    }
  }

  /**
   * Process speech input for language verification
   */
  async processSpeechForLanguageVerification(speechText, customerId = null) {
    try {
      // Detect language from speech
      const detection = this.detectLanguage(speechText);
      
      console.log(`🗣️ Speech language detection:`, {
        text: speechText.substring(0, 100) + '...',
        detected: detection.language,
        confidence: detection.confidence,
        customerId
      });

      // If we have a customer ID, verify their language settings
      if (customerId) {
        const verification = await this.verifyCustomerLanguage(customerId, detection.language);
        
        return {
          speechText,
          detection,
          verification,
          recommendedAction: this.getRecommendedAction(detection, verification)
        };
      }

      // Return just the detection if no customer context
      return {
        speechText,
        detection,
        verification: null,
        recommendedAction: {
          action: 'detect_language',
          message: `Language detected as ${this.supportedLanguages[detection.language] || 'unknown'} with ${Math.round(detection.confidence * 100)}% confidence`
        }
      };
    } catch (error) {
      console.error('Error processing speech for language verification:', error);
      throw error;
    }
  }

  /**
   * Get recommended action based on detection and verification results
   */
  getRecommendedAction(detection, verification) {
    if (!verification) {
      return { action: 'detect_language', message: 'Language detected but no customer context' };
    }

    if (verification.needsVerification) {
      if (detection.language === verification.suggestedLanguage && detection.confidence > this.confidenceThreshold) {
        return {
          action: 'confirm_language',
          message: `Detected ${this.supportedLanguages[detection.language]} - switch to ${this.supportedLanguages[verification.suggestedLanguage]} agent?`,
          targetLanguage: verification.suggestedLanguage,
          targetAgents: verification.suggestedAgents
        };
      } else if (detection.language === 'unknown' || detection.confidence < this.confidenceThreshold) {
        return {
          action: 'ask_language_preference',
          message: 'Could not reliably detect language - ask customer for preference',
          availableLanguages: Object.keys(this.supportedLanguages).filter(lang => 
            verification.availableAgents.some(agent => agent.supported_language === lang)
          )
        };
      }
    }

    return {
      action: 'continue',
      message: 'Language confirmed, continue with current agent',
      currentAgent: verification.availableAgents[0]
    };
  }
}

module.exports = LanguageVerificationService;