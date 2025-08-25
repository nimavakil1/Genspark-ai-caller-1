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

  // Get agent details
  const agentResult = await query(`
    SELECT * FROM agents WHERE id = $1 AND is_active = true
  `, [id]);

  if (agentResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Agent not found'
    });
  }

  const agent = agentResult.rows[0];

  // Get agent knowledge
  const knowledgeResult = await query(`
    SELECT * FROM agent_knowledge 
    WHERE agent_id = $1 AND is_active = true
  `, [id]);

  // TODO: Integrate with Telnyx and LiveKit for actual voice testing
  // For now, return success with agent data
  res.json({
    success: true,
    message: 'Test call initiated with agent',
    agent: {
      ...agent,
      knowledge: knowledgeResult.rows
    },
    test_details: {
      phone_number,
      test_scenario: test_scenario || 'Standard conversation test',
      note: 'Voice call simulation will be implemented in the next phase'
    }
  });
}));

module.exports = router;