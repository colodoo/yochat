import { StateGraph, END, START } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createLogger } from '../utils/logger';
import OpenAI from 'openai';

const agentLogger = createLogger('Agent');

// Agent状态接口
interface AgentState {
  messages: BaseMessage[];
  iterations: number;
  maxIterations: number;
  tools?: any[];
  toolResults?: any[];
  reflection?: string;
  plan?: string[];
  currentStep?: number;
}

// Agent类型枚举
export enum AgentType {
  DIRECT = 'direct',           // 直接对话
  REACT = 'react',             // 推理-行动循环
  REFLEXION = 'reflexion',     // 反思型Agent
  PLAN_SOLVE = 'plan_solve'    // 计划-解决型Agent
}

// Agent配置接口
interface AgentConfig {
  model: any;
  tools?: any[];
  maxIterations?: number;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  onProgress?: (text: string) => void;
}

export class AgentFactory {
  /**
   * 创建Agent图
   */
  static createAgent(type: AgentType, config: AgentConfig) {
    switch (type) {
      case AgentType.DIRECT:
        return this.createDirectAgent(config);
      case AgentType.REACT:
        return this.createReActAgent(config);
      case AgentType.REFLEXION:
        return this.createReflexionAgent(config);
      case AgentType.PLAN_SOLVE:
        return this.createPlanSolveAgent(config);
      default:
        throw new Error(`不支持的Agent类型: ${type}`);
    }
  }

  /**
   * 直接对话Agent - 简单的问答模式
   */
  private static createDirectAgent(config: AgentConfig) {
    const workflow = new StateGraph<AgentState>({
      channels: {
        messages: {
          reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
          default: () => []
        },
        iterations: {
          default: () => 0
        },
        maxIterations: {
          default: () => config.maxIterations || 5
        },
        tools: {
          default: () => config.tools || []
        },
        toolResults: {
          default: () => []
        }
      }
    });

    // 直接响应节点
    workflow.addNode('respond', async (state: AgentState) => {
      agentLogger.info('🤖 [直接对话模式] 开始生成响应...');
      
      const messages = state.messages;
      const lastMessage = messages[messages.length - 1];
      
      if (!lastMessage || lastMessage.constructor.name !== 'HumanMessage') {
        agentLogger.error('❌ [直接对话模式] 错误: 需要用户消息');
        throw new Error('需要用户消息');
      }

      try {
        agentLogger.info('📝 [直接对话模式] 构建消息上下文...');
        // 构建系统消息
        const systemMessage = new SystemMessage(config.systemPrompt || '你是一个有用的AI助手。');
        const allMessages = [systemMessage, ...messages];
        agentLogger.info(`📊 [直接对话模式] 消息数量: ${allMessages.length}`);

        agentLogger.info('🚀 [直接对话模式] 调用大模型...');
        // 调用模型
        const response = await this.callModel(config.model, allMessages, config, config.onProgress);
        
        agentLogger.info('✅ [直接对话模式] 响应生成完成');
        return {
          messages: [new AIMessage(response.content || '')],
          iterations: state.iterations + 1
        };
      } catch (error) {
        agentLogger.error('❌ [直接对话模式] 生成响应失败:', error);
        throw error;
      }
    });

    workflow.addEdge(START, 'respond');
    workflow.addEdge('respond', END);

    return workflow.compile();
  }

  /**
   * ReAct Agent - 推理-行动循环
   */
  private static createReActAgent(config: AgentConfig) {
    const workflow = new StateGraph<AgentState>({
      channels: {
        messages: {
          reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
          default: () => []
        },
        iterations: {
          default: () => 0
        },
        maxIterations: {
          default: () => config.maxIterations || 10
        },
        tools: {
          default: () => config.tools || []
        },
        toolResults: {
          default: () => []
        }
      }
    });

    // 推理节点
    workflow.addNode('reason', async (state: AgentState) => {
      agentLogger.info(`🧠 [ReAct模式] 开始推理阶段 (第${state.iterations + 1}次迭代)`);
      
      const systemPrompt = `${config.systemPrompt || '你是一个有用的AI助手。'}

你需要按照以下格式进行推理和行动：

思考: [分析当前情况和需要采取的行动]
行动: [如果需要使用工具，描述要使用的工具和参数；如果可以直接回答，说明"直接回答"]
观察: [工具执行结果或直接回答的内容]

如果你有足够的信息来回答用户的问题，请提供最终答案。`;

      agentLogger.info(`📝 [ReAct模式] 构建推理上下文，消息数量: ${state.messages.length}`);
      const messages = [new SystemMessage(systemPrompt), ...state.messages];
      agentLogger.info(`📝 [ReAct模式] 推理上下文: ${JSON.stringify(messages)}`);
      
      try {
        agentLogger.info('🚀 [ReAct模式] 调用大模型进行推理...');
        const response = await this.callModel(config.model, messages, {
          ...config,
          tools: state.tools
        }, config.onProgress);
        
        const hasToolCalls = response.tool_calls && response.tool_calls.length > 0;
        agentLogger.info(`✅ [ReAct模式] 推理完成，${hasToolCalls ? '需要执行工具调用' : '无需工具调用'}`);
        
        return {
          messages: [new AIMessage(response.content || '')],
          iterations: state.iterations + 1,
          toolResults: response.tool_calls ? response.tool_calls : state.toolResults
        };
      } catch (error) {
        agentLogger.error('❌ [ReAct模式] 推理失败:', error);
        throw error;
      }
    });

    // 检查是否需要继续
    workflow.addNode('should_continue', async (state: AgentState) => {
      const lastMessage = state.messages[state.messages.length - 1];
      const hasToolCalls = state.toolResults && state.toolResults.length > 0;
      const reachedMaxIterations = state.iterations >= state.maxIterations;
      
      agentLogger.info(`🔍 [ReAct模式] 检查是否需要继续 (迭代: ${state.iterations}/${state.maxIterations})`);
      
      if (reachedMaxIterations) {
        agentLogger.info('⏹️ [ReAct模式] 达到最大迭代次数，停止执行');
        return { shouldContinue: false };
      }
      
      if (hasToolCalls) {
        agentLogger.info(`🔧 [ReAct模式] 检测到${state.toolResults.length}个工具调用，继续执行`);
        return { shouldContinue: true };
      }
      
      agentLogger.info('✅ [ReAct模式] 推理完成，无需继续');
      return { shouldContinue: false };
    });

    workflow.addEdge(START, 'reason');
    workflow.addEdge('reason', 'should_continue');
    
    workflow.addConditionalEdges(
      'should_continue',
      (state: any) => state.shouldContinue ? 'reason' : END
    );

    return workflow.compile();
  }

  /**
   * Reflexion Agent - 反思型Agent
   */
  private static createReflexionAgent(config: AgentConfig) {
    const workflow = new StateGraph<AgentState>({
      channels: {
        messages: {
          reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
          default: () => []
        },
        iterations: {
          default: () => 0
        },
        maxIterations: {
          default: () => config.maxIterations || 8
        },
        tools: {
          default: () => config.tools || []
        },
        toolResults: {
          default: () => []
        },
        reflection: {
          default: () => ''
        }
      }
    });

    // 初始响应节点
    workflow.addNode('initial_response', async (state: AgentState) => {
      agentLogger.info('🎯 [反思模式] 开始生成初始响应...');
      
      const systemPrompt = `${config.systemPrompt || '你是一个有用的AI助手。'}

请仔细思考用户的问题，提供一个初始的回答。之后你将有机会反思和改进这个回答。`;

      agentLogger.info('📝 [反思模式] 构建初始响应上下文...');
      const messages = [new SystemMessage(systemPrompt), ...state.messages];
      
      try {
          agentLogger.info('🚀 [反思模式] 调用大模型生成初始回答...');
          const response = await this.callModel(config.model, messages, config, config.onProgress);
          
          agentLogger.info('✅ [反思模式] 初始响应生成完成，准备进入反思阶段');
        return {
          messages: [new AIMessage(response.content || '')],
          iterations: state.iterations + 1
        };
      } catch (error) {
        agentLogger.error('❌ [反思模式] 初始响应生成失败:', error);
        throw error;
      }
    });

    // 反思节点
    workflow.addNode('reflect', async (state: AgentState) => {
      agentLogger.info(`🤔 [反思模式] 开始反思阶段 (第${state.iterations}次迭代)`);
      
      const lastResponse = state.messages[state.messages.length - 1];
      const originalQuestion = state.messages.find(m => m.constructor.name === 'HumanMessage');
      
      agentLogger.info('📋 [反思模式] 构建反思评估提示...');
      const reflectionPrompt = `请仔细审查以下回答是否准确、完整和有用：

原始问题: ${originalQuestion?.content}
当前回答: ${lastResponse.content}

请分析这个回答的优缺点，并提出改进建议。如果回答已经很好，请说明原因。`;
      
      const reflectionMessages = [
        new SystemMessage('你是一个专业的回答评估专家，负责分析和改进AI助手的回答质量。'),
        new HumanMessage(reflectionPrompt)
      ];
      
      try {
        agentLogger.info('🚀 [反思模式] 调用大模型进行反思评估...');
        const reflection = await this.callModel(config.model, reflectionMessages, config, config.onProgress);
        
        agentLogger.info('✅ [反思模式] 反思评估完成，准备改进回答');
        return {
          reflection: reflection.content || '',
          iterations: state.iterations + 1
        };
      } catch (error) {
        agentLogger.error('❌ [反思模式] 反思阶段失败:', error);
        throw error;
      }
    });

    // 改进响应节点
    workflow.addNode('improve_response', async (state: AgentState) => {
      agentLogger.info('🔧 [反思模式] 开始改进响应...');
      
      const originalQuestion = state.messages.find(m => m.constructor.name === 'HumanMessage');
      const previousResponse = state.messages[state.messages.length - 1];
      
      agentLogger.info('📝 [反思模式] 基于反思意见构建改进提示...');
      const improvePrompt = `基于以下反思意见，请改进你的回答：

原始问题: ${originalQuestion?.content}
之前的回答: ${previousResponse.content}
反思意见: ${state.reflection}

请提供一个改进后的、更准确和完整的回答。`;
      
      const improveMessages = [
        new SystemMessage(config.systemPrompt || '你是一个有用的AI助手。'),
        new HumanMessage(improvePrompt)
      ];
      
      try {
        agentLogger.info('🚀 [反思模式] 调用大模型生成改进回答...');
        const improvedResponse = await this.callModel(config.model, improveMessages, config, config.onProgress);
        
        agentLogger.info('✅ [反思模式] 改进回答生成完成');
        return {
          messages: [new AIMessage(improvedResponse.content || '')],
          iterations: state.iterations + 1
        };
      } catch (error) {
        agentLogger.error('❌ [反思模式] 改进响应失败:', error);
        throw error;
      }
    });

    // 检查是否需要继续反思
    workflow.addNode('should_continue_reflection', async (state: AgentState) => {
      const reachedMaxIterations = state.iterations >= state.maxIterations;
      
      agentLogger.info(`🔍 [反思模式] 检查是否需要继续反思 (迭代: ${state.iterations}/${state.maxIterations})`);
      
      if (reachedMaxIterations) {
        agentLogger.info('⏹️ [反思模式] 达到最大迭代次数，停止反思');
        return { shouldContinue: false };
      }
      
      // 简单的停止条件：进行一次反思后停止
      if (state.iterations >= 3) {
        agentLogger.info('✅ [反思模式] 完成反思循环，输出最终答案');
        return { shouldContinue: false };
      }
      
      agentLogger.info('🔄 [反思模式] 继续反思循环');
      return { shouldContinue: true };
    });

    workflow.addEdge(START, 'initial_response');
    workflow.addEdge('initial_response', 'reflect');
    workflow.addEdge('reflect', 'improve_response');
    workflow.addEdge('improve_response', 'should_continue_reflection');
    
    workflow.addConditionalEdges(
      'should_continue_reflection',
      (state: any) => state.shouldContinue ? 'reflect' : END
    );

    return workflow.compile();
  }

  /**
   * Plan and Solve Agent - 计划-解决型Agent
   */
  private static createPlanSolveAgent(config: AgentConfig) {
    const workflow = new StateGraph<AgentState>({
      channels: {
        messages: {
          reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
          default: () => []
        },
        iterations: {
          default: () => 0
        },
        maxIterations: {
          default: () => config.maxIterations || 10
        },
        tools: {
          default: () => config.tools || []
        },
        toolResults: {
          default: () => []
        },
        plan: {
          default: () => []
        },
        currentStep: {
          default: () => 0
        }
      }
    });

    // 制定计划节点
    workflow.addNode('make_plan', async (state: AgentState) => {
      agentLogger.info('📋 [计划-解决] 开始制定解决计划...');
      
      const userMessage = state.messages.find(m => m.constructor.name === 'HumanMessage');
      agentLogger.info(`🎯 [计划-解决] 分析问题: ${userMessage?.content?.substring(0, 100)}...`);
      
      const planPrompt = `请为以下问题制定一个详细的解决计划：

问题: ${userMessage?.content}

请将解决方案分解为具体的步骤，每个步骤应该是可执行的。请以JSON格式返回计划，格式如下：
{
  "steps": [
    "步骤1描述",
    "步骤2描述",
    "步骤3描述"
  ]
}`;
      
      agentLogger.info('📝 [计划-解决] 构建计划制定提示...');
      const planMessages = [
        new SystemMessage('你是一个专业的问题分析和计划制定专家。'),
        new HumanMessage(planPrompt)
      ];
      
      try {
        agentLogger.info('🚀 [计划-解决] 调用大模型制定解决计划...');
        const planResponse = await this.callModel(config.model, planMessages, config, config.onProgress);
        
        agentLogger.info('🔍 [计划-解决] 解析计划结构...');
        // 尝试解析计划
        let plan: string[] = [];
        try {
          const planData = JSON.parse(planResponse.content || '{}');
          plan = planData.steps || [];
          agentLogger.info(`✅ [计划-解决] 成功解析计划，包含${plan.length}个步骤`);
        } catch {
          // 如果解析失败，将整个响应作为单个步骤
          plan = [planResponse.content || ''];
          agentLogger.info('⚠️ [计划-解决] 计划解析失败，使用原始响应作为单步骤');
        }
        
        agentLogger.info('📊 [计划-解决] 计划制定完成，准备执行阶段');
        return {
          plan,
          iterations: state.iterations + 1,
          messages: [new AIMessage(`制定了包含${plan.length}个步骤的解决计划`)]
        };
      } catch (error) {
        agentLogger.error('❌ [计划-解决] 制定计划失败:', error);
        throw error;
      }
    });

    // 执行步骤节点
    workflow.addNode('execute_step', async (state: AgentState) => {
      const currentStep = state.currentStep || 0;
      const plan = state.plan || [];
      
      agentLogger.info(`⚡ [计划-解决] 开始执行步骤 ${currentStep + 1}/${plan.length}`);
      
      if (currentStep >= plan.length) {
        agentLogger.info('🎉 [计划-解决] 所有步骤已完成');
        return {
          messages: [new AIMessage('所有计划步骤已完成')],
          iterations: state.iterations + 1
        };
      }
      
      const stepDescription = plan[currentStep];
      agentLogger.info(`📋 [计划-解决] 当前步骤内容: ${stepDescription.substring(0, 100)}...`);
      
      const executePrompt = `请执行以下计划步骤：

当前步骤 (${currentStep + 1}/${plan.length}): ${stepDescription}

原始问题: ${state.messages.find(m => m.constructor.name === 'HumanMessage')?.content}

请详细执行这个步骤并提供结果。`;
      
      agentLogger.info('📝 [计划-解决] 构建步骤执行指令...');
      const executeMessages = [
        new SystemMessage(config.systemPrompt || '你是一个有用的AI助手。'),
        new HumanMessage(executePrompt)
      ];
      
      try {
        agentLogger.info(`🚀 [计划-解决] 调用大模型执行步骤 ${currentStep + 1}...`);
        const stepResponse = await this.callModel(config.model, executeMessages, {
          ...config,
          tools: state.tools
        }, config.onProgress);
        
        const hasToolCalls = stepResponse.tool_calls && stepResponse.tool_calls.length > 0;
        agentLogger.info(`✅ [计划-解决] 步骤 ${currentStep + 1} 执行完成${hasToolCalls ? '，包含工具调用' : ''}`);
        
        return {
          messages: [new AIMessage(`步骤${currentStep + 1}结果: ${stepResponse.content}`)],
          currentStep: currentStep + 1,
          iterations: state.iterations + 1,
          toolResults: stepResponse.tool_calls ? stepResponse.tool_calls : state.toolResults
        };
      } catch (error) {
        agentLogger.error(`❌ [计划-解决] 执行步骤${currentStep + 1}失败:`, error);
        throw error;
      }
    });

    // 检查是否完成所有步骤
    workflow.addNode('check_completion', async (state: AgentState) => {
      const currentStep = state.currentStep || 0;
      const plan = state.plan || [];
      const reachedMaxIterations = state.iterations >= state.maxIterations;
      
      agentLogger.info(`🔍 [计划-解决] 检查执行进度 (${currentStep}/${plan.length} 步骤，${state.iterations}/${state.maxIterations} 迭代)`);
      
      if (reachedMaxIterations) {
        agentLogger.info('⏹️ [计划-解决] 达到最大迭代次数，停止执行');
        return { isComplete: true };
      }
      
      if (currentStep >= plan.length) {
        agentLogger.info('🎯 [计划-解决] 所有步骤已完成，准备生成总结');
        return { isComplete: true };
      }
      
      agentLogger.info(`🔄 [计划-解决] 继续执行下一步骤 (${currentStep + 1}/${plan.length})`);
      return { isComplete: false };
    });

    // 生成最终总结
    workflow.addNode('summarize', async (state: AgentState) => {
      agentLogger.info('📝 [计划-解决] 开始生成最终总结...');
      
      const originalQuestion = state.messages.find(m => m.constructor.name === 'HumanMessage');
      const stepResults = state.messages.filter(m => 
        m.constructor.name === 'AIMessage' && 
        m.content.includes('步骤') && 
        m.content.includes('结果')
      );
      
      agentLogger.info(`📊 [计划-解决] 整理执行结果，共${stepResults.length}个步骤结果`);
      
      const summarizePrompt = `请基于以下步骤执行结果，为原始问题提供一个完整的总结答案：

原始问题: ${originalQuestion?.content}

执行步骤结果:
${stepResults.map((msg, i) => `${i + 1}. ${msg.content}`).join('\n')}

请提供一个清晰、完整的最终答案。`;
      
      agentLogger.info('📝 [计划-解决] 构建总结提示...');
      const summarizeMessages = [
        new SystemMessage(config.systemPrompt || '你是一个有用的AI助手。'),
        new HumanMessage(summarizePrompt)
      ];
      
      try {
        agentLogger.info('🚀 [计划-解决] 调用大模型生成最终总结...');
        const summary = await this.callModel(config.model, summarizeMessages, config, config.onProgress);
        
        agentLogger.info('🎉 [计划-解决] 最终总结生成完成，任务结束');
        return {
          messages: [new AIMessage(summary.content || '')],
          iterations: state.iterations + 1
        };
      } catch (error) {
        agentLogger.error('❌ [计划-解决] 生成总结失败:', error);
        throw error;
      }
    });

    workflow.addEdge(START, 'make_plan');
    workflow.addEdge('make_plan', 'execute_step');
    workflow.addEdge('execute_step', 'check_completion');
    
    workflow.addConditionalEdges(
      'check_completion',
      (state: any) => state.isComplete ? 'summarize' : 'execute_step'
    );
    
    workflow.addEdge('summarize', END);

    return workflow.compile();
  }

  /**
   * 调用模型的通用方法
   */
  private static async callModel(model: any, messages: BaseMessage[], config: AgentConfig, onProgress?: (text: string) => void): Promise<any> {
    try {
      // 转换消息格式为OpenAI格式
      const openaiMessages = messages.map(msg => {
        if (msg.constructor.name === 'SystemMessage') {
          return { role: 'system', content: msg.content };
        } else if (msg.constructor.name === 'HumanMessage') {
          return { role: 'user', content: msg.content };
        } else if (msg.constructor.name === 'AIMessage') {
          return { role: 'assistant', content: msg.content };
        }
        return { role: 'user', content: msg.content };
      });

      const requestParams: any = {
        model: model.model_name,
        messages: openaiMessages,
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 2048
      };

      // 如果有工具，添加工具配置
      if (config.tools && config.tools.length > 0) {
        requestParams.tools = config.tools;
        requestParams.tool_choice = 'auto';
        
        if (onProgress) {
          onProgress(`🔧 **检测到${config.tools.length}个可用工具，准备智能调用...**\n\n`);
        }
      }

      if (onProgress) {
        onProgress(`🤖 **正在调用${model.model_name}模型...**\n\n`);
      }

      const openai = new OpenAI({
        apiKey: model.api_key,
        baseURL: model.api_url
      });

      const response = await openai.chat.completions.create(requestParams);
      
      if (response.choices && response.choices.length > 0) {
        const message = response.choices[0].message;
        
        if (onProgress) {
          if (message.tool_calls && message.tool_calls.length > 0) {
            onProgress(`🔧 **模型决定调用${message.tool_calls.length}个工具...**\n\n`);
          } else {
            onProgress(`💭 **模型思考完成，生成回答中...**\n\n`);
          }
        }
        
        return {
          content: message.content,
          tool_calls: message.tool_calls
        };
      }
      
      throw new Error('模型响应格式错误');
    } catch (error) {
      agentLogger.error('模型调用失败:', error);
      if (onProgress) {
        onProgress(`❌ **模型调用失败: ${(error as Error).message}**\n\n`);
      }
      throw error;
    }
  }

  /**
   * 获取Agent类型的用户友好名称
   */
  static getAgentTypeName(type: AgentType): string {
    switch (type) {
      case AgentType.DIRECT:
        return '直接对话';
      case AgentType.REACT:
        return '智能推理';
      case AgentType.REFLEXION:
        return '深度思考';
      case AgentType.PLAN_SOLVE:
        return '系统规划';
      default:
        return '未知类型';
    }
  }

  /**
   * 获取Agent类型的描述
   */
  static getAgentTypeDescription(type: AgentType): string {
    switch (type) {
      case AgentType.DIRECT:
        return '简单直接的问答模式，适合快速获取答案';
      case AgentType.REACT:
        return '通过推理和行动循环解决复杂问题，适合需要工具调用的任务';
      case AgentType.REFLEXION:
        return '具备自我反思能力，会审查和改进回答质量，适合需要高质量回答的场景';
      case AgentType.PLAN_SOLVE:
        return '先制定计划再逐步执行，适合复杂的多步骤问题解决';
      default:
        return '未知类型';
    }
  }

  /**
   * 获取所有可用的Agent类型
   */
  static getAllAgentTypes() {
    return Object.values(AgentType).map(type => ({
      value: type,
      name: this.getAgentTypeName(type),
      description: this.getAgentTypeDescription(type)
    }));
  }
}