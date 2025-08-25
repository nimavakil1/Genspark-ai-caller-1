const express = require('express');
const { query, transaction } = require('../src/database');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Get all agents
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT 
      a.*,
      COUNT(ak.id) as knowledge_count
    FROM agents a
    LEFT JOIN agent_knowledge ak ON a.id = ak.agent_id AND ak.is_active = true
    WHERE a.is_active = true
    GROUP BY a.id
    ORDER BY a.created_at DESC
  `);

  res.json({
    success: true,
    agents: result.rows
  });
}));

// Get single agent by ID
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const agentResult = await query(`
    SELECT * FROM agents WHERE id = $1 AND is_active = true
  `, [id]);

  if (agentResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Agent not found'
    });
  }

  const knowledgeResult = await query(`
    SELECT * FROM agent_knowledge 
    WHERE agent_id = $1 AND is_active = true
    ORDER BY created_at DESC
  `, [id]);

  res.json({
    success: true,
    agent: {
      ...agentResult.rows[0],
      knowledge: knowledgeResult.rows
    }
  });
}));

// Create new agent
router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const { name, description, system_prompt, voice_settings } = req.body;

  if (!name || !system_prompt) {
    return res.status(400).json({
      success: false,
      error: 'Name and system prompt are required'
    });
  }

  const result = await query(`
    INSERT INTO agents (name, description, system_prompt, voice_settings)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [
    name,
    description || null,
    system_prompt,
    voice_settings ? JSON.stringify(voice_settings) : '{}'
  ]);

  res.status(201).json({
    success: true,
    message: 'Agent created successfully',
    agent: result.rows[0]
  });
}));

// Update agent
router.put('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, system_prompt, voice_settings } = req.body;

  if (!name || !system_prompt) {
    return res.status(400).json({
      success: false,
      error: 'Name and system prompt are required'
    });
  }

  const result = await query(`
    UPDATE agents 
    SET 
      name = $1,
      description = $2,
      system_prompt = $3,
      voice_settings = $4,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $5 AND is_active = true
    RETURNING *
  `, [
    name,
    description || null,
    system_prompt,
    voice_settings ? JSON.stringify(voice_settings) : '{}',
    id
  ]);

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Agent not found'
    });
  }

  res.json({
    success: true,
    message: 'Agent updated successfully',
    agent: result.rows[0]
  });
}));

// Delete agent (soft delete)
router.delete('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await query(`
    UPDATE agents 
    SET is_active = false, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND is_active = true
    RETURNING *
  `, [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Agent not found'
    });
  }

  res.json({
    success: true,
    message: 'Agent deleted successfully'
  });
}));

// Add knowledge to agent
router.post('/:id/knowledge', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, content, file_url, file_type } = req.body;

  if (!title || (!content && !file_url)) {
    return res.status(400).json({
      success: false,
      error: 'Title and either content or file URL are required'
    });
  }

  // Check if agent exists
  const agentCheck = await query(`
    SELECT id FROM agents WHERE id = $1 AND is_active = true
  `, [id]);

  if (agentCheck.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Agent not found'
    });
  }

  const result = await query(`
    INSERT INTO agent_knowledge (agent_id, title, content, file_url, file_type)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [id, title, content || null, file_url || null, file_type || null]);

  res.status(201).json({
    success: true,
    message: 'Knowledge added successfully',
    knowledge: result.rows[0]
  });
}));

// Update agent knowledge
router.put('/:id/knowledge/:knowledge_id', authenticateToken, asyncHandler(async (req, res) => {
  const { id, knowledge_id } = req.params;
  const { title, content, file_url, file_type } = req.body;

  if (!title || (!content && !file_url)) {
    return res.status(400).json({
      success: false,
      error: 'Title and either content or file URL are required'
    });
  }

  const result = await query(`
    UPDATE agent_knowledge 
    SET 
      title = $1,
      content = $2,
      file_url = $3,
      file_type = $4,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $5 AND agent_id = $6 AND is_active = true
    RETURNING *
  `, [title, content || null, file_url || null, file_type || null, knowledge_id, id]);

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Knowledge entry not found'
    });
  }

  res.json({
    success: true,
    message: 'Knowledge updated successfully',
    knowledge: result.rows[0]
  });
}));

// Delete agent knowledge (soft delete)
router.delete('/:id/knowledge/:knowledge_id', authenticateToken, asyncHandler(async (req, res) => {
  const { id, knowledge_id } = req.params;

  const result = await query(`
    UPDATE agent_knowledge 
    SET is_active = false, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND agent_id = $2 AND is_active = true
    RETURNING *
  `, [knowledge_id, id]);

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Knowledge entry not found'
    });
  }

  res.json({
    success: true,
    message: 'Knowledge deleted successfully'
  });
}));

// Test agent with voice call simulation
router.post('/:id/test-call', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { phone_number, test_scenario } = req.body;

  if (!phone_number) {
    return res.status(400).json({
      success: false,
      error: 'Phone number is required for testing'
    });
  }

  // Get agent details with knowledge
  const agentResult = await query(`
    SELECT a.*, 
    JSON_AGG(
      CASE WHEN ak.id IS NOT NULL 
      THEN JSON_BUILD_OBJECT(
        'id', ak.id,
        'title', ak.title,
        'content', ak.content,
        'file_url', ak.file_url,
        'file_type', ak.file_type
      ) END
    ) as knowledge
    FROM agents a
    LEFT JOIN agent_knowledge ak ON a.id = ak.agent_id AND ak.is_active = true
    WHERE a.id = $1 AND a.is_active = true
    GROUP BY a.id
  `, [id]);

  if (agentResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Agent not found'
    });
  }

  const agent = agentResult.rows[0];
  // Filter out null knowledge entries
  agent.knowledge = agent.knowledge.filter(k => k !== null);

  // Make actual test call via call control API
  try {
    const testCallResponse = await fetch(`${process.env.SERVER_BASE_URL || 'http://localhost:3001'}/api/call-control/test-call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: phone_number,
        customer_name: `Test Customer (Agent: ${agent.name})`,
        agent_id: id
      })
    });

    if (!testCallResponse.ok) {
      throw new Error('Failed to initiate test call');
    }

    const testCallResult = await testCallResponse.json();

    res.json({
      success: true,
      message: 'Agent test call initiated successfully',
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        voice_settings: agent.voice_settings,
        knowledge_count: agent.knowledge.length
      },
      call_details: {
        call_control_id: testCallResult.call_control_id,
        phone_number,
        test_scenario: test_scenario || 'Standard conversation test',
        voice_model: agent.voice_settings?.voice || 'alloy',
        language: agent.voice_settings?.language || 'en'
      },
      note: `Real voice call initiated using agent ${agent.name} with custom conversation flow and voice settings`
    });

  } catch (error) {
    console.error('Error initiating agent test call:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate agent test call',
      details: error.message
    });
  }
}));

module.exports = router;