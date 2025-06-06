//@ts-nocheck
import React, { useState, useEffect, useRef } from 'react';

// Types
interface Message {
 id: string;
 content: string;
 sender: 'user' | 'assistant';
 timestamp: Date;
 memoryActions?: MemoryAction[];
 hasError?: boolean;
 corrected?: boolean;
}

interface MemoryAction {
 type: 'add' | 'search' | 'delete' | 'update';
 category: 'procedural' | 'episodic' | 'semantic';
 content: string;
 importance: number;
}

interface CognitiveMemory {
 id: string;
 type: 'procedural' | 'episodic' | 'semantic';
 content: string;
 context: string;
 importance: number;
 timestamp: Date;
 userId: string;
 embedding?: number[];
 tags: string[];
 usageCount: number;
 lastUsed?: Date;
}

interface LearningEvent {
 id: string;
 type: 'error' | 'correction' | 'preference' | 'success';
 original: string;
 corrected?: string;
 context: string;
 timestamp: Date;
 applied: boolean;
}

// Service Mistral API
class MistralApiService {
 private apiKey: string;
 private baseUrl = 'https://api.mistral.ai/v1';

 constructor(apiKey: string) {
   this.apiKey = apiKey;
 }

 async generateEmbedding(text: string): Promise<number[]> {
   try {
     const response = await fetch(`${this.baseUrl}/embeddings`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${this.apiKey}`
       },
       body: JSON.stringify({
         model: 'mistral-embed',
         input: [text]
       })
     });

     if (!response.ok) {
       throw new Error(`Erreur API: ${response.status}`);
     }

     const data = await response.json();
     return data.data[0].embedding;
   } catch (error) {
     console.error('Erreur génération embedding:', error);
     return Array.from({ length: 1024 }, () => Math.random() - 0.5);
   }
 }

 async generateResponse(messages: Array<{role: string, content: string}>): Promise<string> {
   try {
     const response = await fetch(`${this.baseUrl}/chat/completions`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${this.apiKey}`
       },
       body: JSON.stringify({
         model: 'mistral-large-latest',
         messages: messages,
         temperature: 0.3
       })
     });

     if (!response.ok) {
       throw new Error(`Erreur API: ${response.status}`);
     }

     const data = await response.json();
     return data.choices[0].message.content;
   } catch (error) {
     console.error('Erreur génération réponse:', error);
     return "Erreur de connexion avec l'API Mistral.";
   }
 }
}

// Service de mémoire cognitive
class CognitiveMemoryService {
 private memories: CognitiveMemory[] = [];
 private learningEvents: LearningEvent[] = [];
 private mistralService: MistralApiService;
 private userId: string;

 constructor(mistralService: MistralApiService, userId: string = 'default-user') {
   this.mistralService = mistralService;
   this.userId = userId;
   this.loadMemories();
 }

 private loadMemories() {
   const savedMemories = localStorage.getItem(`cognitive_memories_${this.userId}`);
   const savedLearning = localStorage.getItem(`learning_events_${this.userId}`);
   
   if (savedMemories) {
     this.memories = JSON.parse(savedMemories).map((mem: any) => ({
       ...mem,
       timestamp: new Date(mem.timestamp),
       lastUsed: mem.lastUsed ? new Date(mem.lastUsed) : undefined
     }));
   }
   
   if (savedLearning) {
     this.learningEvents = JSON.parse(savedLearning).map((event: any) => ({
       ...event,
       timestamp: new Date(event.timestamp)
     }));
   }
 }

 private saveMemories() {
   localStorage.setItem(`cognitive_memories_${this.userId}`, JSON.stringify(this.memories));
   localStorage.setItem(`learning_events_${this.userId}`, JSON.stringify(this.learningEvents));
 }

 private cosineSimilarity(a: number[], b: number[]): number {
   if (a.length !== b.length) return 0;
   
   const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
   const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
   const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
   
   if (magnitudeA === 0 || magnitudeB === 0) return 0;
   return dotProduct / (magnitudeA * magnitudeB);
 }

 // Auto-analyse pour déterminer quoi mémoriser
 async analyzeForMemory(conversation: string, userMessage: string, assistantResponse: string): Promise<MemoryAction[]> {
   const analysisPrompt = [
     {
       role: 'system',
       content: `Tu es un agent cognitif qui analyse les conversations pour déterminer quoi mémoriser automatiquement.

Analyse cette interaction et détermine quelles informations stocker dans la mémoire cognitive.

Types de mémoire:
- procedural: Comment faire quelque chose (processus, méthodes)
- episodic: Événements spécifiques, préférences personnelles, RDV
- semantic: Faits généraux, connaissances

RÉPONDS en JSON avec un array d'actions:
[
 {
   "type": "add",
   "category": "episodic|procedural|semantic",
   "content": "information à retenir",
   "importance": 1-10,
   "tags": ["tag1", "tag2"]
 }
]

Si rien d'important, réponds: []

Mémorise les:
- Informations personnelles (nom, âge, préférences)
- Rendez-vous et événements
- Erreurs à éviter
- Processus spécifiques
- Faits importants pour l'utilisateur`
     },
     {
       role: 'user',
       content: `Conversation: ${conversation}\n\nUtilisateur: ${userMessage}\nAssistant: ${assistantResponse}`
     }
   ];

   try {
     const response = await this.mistralService.generateResponse(analysisPrompt);
     const cleanResponse = response.trim();
     
     if (cleanResponse === '[]') return [];
     
     const actions = JSON.parse(cleanResponse);
     return Array.isArray(actions) ? actions : [];
   } catch (error) {
     console.error('Erreur analyse mémoire:', error);
     return [];
   }
 }

 // Détection d'erreurs et corrections
 async detectErrorAndCorrection(previousResponse: string, userCorrection: string): Promise<LearningEvent | null> {
   const errorAnalysisPrompt = [
     {
       role: 'system',
       content: `Analyse si l'utilisateur corrige une erreur de l'assistant.

RÉPONDS en JSON:
{
 "isCorrection": true|false,
 "type": "error|preference|clarification",
 "context": "contexte de l'erreur",
 "learning": "ce qu'il faut retenir pour éviter cette erreur"
}

Si pas de correction, réponds: {"isCorrection": false}`
     },
     {
       role: 'user',
       content: `Réponse assistant: ${previousResponse}\n\nCorrection utilisateur: ${userCorrection}`
     }
   ];

   try {
     const response = await this.mistralService.generateResponse(errorAnalysisPrompt);
     const analysis = JSON.parse(response.trim());
     
     if (!analysis.isCorrection) return null;
     
     const learningEvent: LearningEvent = {
       id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
       type: analysis.type === 'error' ? 'error' : 'correction',
       original: previousResponse,
       corrected: userCorrection,
       context: analysis.context,
       timestamp: new Date(),
       applied: false
     };
     
     this.learningEvents.push(learningEvent);
     
     // Auto-mémoriser la correction
     await this.addMemory({
       type: 'procedural',
       content: analysis.learning,
       context: analysis.context,
       importance: 8,
       tags: ['error-learning', 'correction'],
       userId: this.userId
     });
     
     return learningEvent;
   } catch (error) {
     console.error('Erreur détection erreur:', error);
     return null;
   }
 }

 // Ajouter une mémoire
 async addMemory(data: {
   type: 'procedural' | 'episodic' | 'semantic';
   content: string;
   context: string;
   importance: number;
   tags: string[];
   userId: string;
 }): Promise<void> {
   try {
     const embedding = await this.mistralService.generateEmbedding(data.content);
     
     const memory: CognitiveMemory = {
       id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
       type: data.type,
       content: data.content,
       context: data.context,
       importance: data.importance,
       timestamp: new Date(),
       userId: data.userId,
       embedding,
       tags: data.tags,
       usageCount: 0
     };
     
     this.memories.push(memory);
     this.saveMemories();
   } catch (error) {
     console.error('Erreur ajout mémoire:', error);
   }
 }

 // Rechercher dans la mémoire
 async searchMemory(query: string, type?: 'procedural' | 'episodic' | 'semantic'): Promise<CognitiveMemory[]> {
   if (this.memories.length === 0) return [];
   
   try {
     const queryEmbedding = await this.mistralService.generateEmbedding(query);
     
     let filteredMemories = this.memories.filter(mem => mem.userId === this.userId);
     
     if (type) {
       filteredMemories = filteredMemories.filter(mem => mem.type === type);
     }
     
     const similarities = filteredMemories.map(memory => ({
       memory,
       similarity: this.cosineSimilarity(queryEmbedding, memory.embedding!)
     }));
     
     const results = similarities
       .filter(item => item.similarity > 0.3)
       .sort((a, b) => {
         // Tri par pertinence + importance + fraîcheur
         const scoreA = (a.similarity * 0.4) + (a.memory.importance / 10 * 0.4) + (a.memory.usageCount * 0.2);
         const scoreB = (b.similarity * 0.4) + (b.memory.importance / 10 * 0.4) + (b.memory.usageCount * 0.2);
         return scoreB - scoreA;
       })
       .slice(0, 5)
       .map(item => {
         // Mettre à jour stats d'usage
         item.memory.usageCount++;
         item.memory.lastUsed = new Date();
         return item.memory;
       });
     
     this.saveMemories();
     return results;
   } catch (error) {
     console.error('Erreur recherche mémoire:', error);
     return [];
   }
 }

 // Obtenir le contexte cognitif
 async getCognitiveContext(query: string): Promise<string> {
   const proceduralMemories = await this.searchMemory(query, 'procedural');
   const episodicMemories = await this.searchMemory(query, 'episodic');
   const semanticMemories = await this.searchMemory(query, 'semantic');
   
   let context = "";
   
   if (proceduralMemories.length > 0) {
     context += "🔧 MÉMOIRE PROCÉDURALE (comment faire):\n";
     proceduralMemories.forEach(mem => {
       context += `- ${mem.content} (${mem.context})\n`;
     });
     context += "\n";
   }
   
   if (episodicMemories.length > 0) {
     context += "📝 MÉMOIRE ÉPISODIQUE (événements personnels):\n";
     episodicMemories.forEach(mem => {
       context += `- ${mem.content} (${mem.context})\n`;
     });
     context += "\n";
   }
   
   if (semanticMemories.length > 0) {
     context += "🧠 MÉMOIRE SÉMANTIQUE (connaissances):\n";
     semanticMemories.forEach(mem => {
       context += `- ${mem.content} (${mem.context})\n`;
     });
     context += "\n";
   }
   
   // Ajouter les apprentissages récents
   const recentLearning = this.learningEvents
     .filter(event => !event.applied)
     .slice(-3);
     
   if (recentLearning.length > 0) {
     context += "🎯 APPRENTISSAGES RÉCENTS:\n";
     recentLearning.forEach(event => {
       context += `- ${event.context}: ${event.corrected || event.original}\n`;
     });
   }
   
   return context;
 }

 getStats(): {
   totalMemories: number;
   procedural: number;
   episodic: number;
   semantic: number;
   learningEvents: number;
 } {
   const userMemories = this.memories.filter(mem => mem.userId === this.userId);
   
   return {
     totalMemories: userMemories.length,
     procedural: userMemories.filter(mem => mem.type === 'procedural').length,
     episodic: userMemories.filter(mem => mem.type === 'episodic').length,
     semantic: userMemories.filter(mem => mem.type === 'semantic').length,
     learningEvents: this.learningEvents.length
   };
 }

 clearMemory(): void {
   this.memories = [];
   this.learningEvents = [];
   localStorage.removeItem(`cognitive_memories_${this.userId}`);
   localStorage.removeItem(`learning_events_${this.userId}`);
 }
}

// Agent cognitif principal
class CognitiveAgent {
 private mistralService: MistralApiService;
 private memoryService: CognitiveMemoryService;
 private conversationHistory: Message[] = [];

 constructor(mistralService: MistralApiService, memoryService: CognitiveMemoryService) {
   this.mistralService = mistralService;
   this.memoryService = memoryService;
 }

 async processMessage(userMessage: string, previousMessage?: Message): Promise<{
   response: string;
   memoryActions: MemoryAction[];
   learningEvent?: LearningEvent;
 }> {
   // Détection de correction d'erreur
   let learningEvent: LearningEvent | undefined;
   if (previousMessage && previousMessage.sender === 'assistant') {
     learningEvent = await this.memoryService.detectErrorAndCorrection(
       previousMessage.content,
       userMessage
     ) || undefined;
   }

   // Obtenir le contexte cognitif
   const cognitiveContext = await this.memoryService.getCognitiveContext(userMessage);
   
   // Générer la réponse avec contexte cognitif
   const systemPrompt = `Tu es un assistant cognitif avec mémoire évolutive. Tu apprends continuellement de tes interactions.

${cognitiveContext ? `CONTEXTE COGNITIF DISPONIBLE:\n${cognitiveContext}` : ''}

INSTRUCTIONS:
- Utilise ton contexte cognitif pour donner des réponses personnalisées
- Apprends de tes erreurs passées
- Sois cohérent avec les préférences mémorisées
- Si tu n'es pas sûr, demande des clarifications
- Évite de répéter les erreurs mentionnées dans tes apprentissages récents`;

   const messages = [
     { role: 'system', content: systemPrompt },
     ...this.conversationHistory.slice(-4).map(msg => ({
       role: msg.sender === 'user' ? 'user' : 'assistant',
       content: msg.content
     })),
     { role: 'user', content: userMessage }
   ];

   const response = await this.mistralService.generateResponse(messages);

   // Auto-analyse pour mémorisation
   const conversationContext = this.conversationHistory.slice(-2)
     .map(msg => `${msg.sender}: ${msg.content}`)
     .join('\n');
     
   const memoryActions = await this.memoryService.analyzeForMemory(
     conversationContext,
     userMessage,
     response
   );

   // Exécuter les actions de mémoire
   for (const action of memoryActions) {
     if (action.type === 'add') {
       await this.memoryService.addMemory({
         type: action.category,
         content: action.content,
         context: `Conversation du ${new Date().toLocaleDateString()}`,
         importance: action.importance,
         tags: action.tags || [],
         userId: this.memoryService['userId']
       });
     }
   }

   return {
     response,
     memoryActions,
     learningEvent
   };
 }

 addToHistory(message: Message): void {
   this.conversationHistory.push(message);
   // Garder seulement les 20 derniers messages pour les performances
   if (this.conversationHistory.length > 20) {
     this.conversationHistory = this.conversationHistory.slice(-20);
   }
 }
}

// Composant principal
const CognitiveChatBot: React.FC = () => {
 const [messages, setMessages] = useState<Message[]>([]);
 const [inputValue, setInputValue] = useState('');
 const [isLoading, setIsLoading] = useState(false);
 const [apiKey, setApiKey] = useState(localStorage.getItem('mistral_api_key') || '');
  // APRÈS (fixe)
const [userId] = useState(() => {
  const savedUserId = localStorage.getItem('cognitive_user_id');
  if (savedUserId) return savedUserId;
  
  const newUserId = 'user-' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('cognitive_user_id', newUserId);
  return newUserId;
});
 const [mistralService, setMistralService] = useState<MistralApiService | null>(null);
 const [memoryService, setMemoryService] = useState<CognitiveMemoryService | null>(null);
 const [cognitiveAgent, setCognitiveAgent] = useState<CognitiveAgent | null>(null);

 const messagesEndRef = useRef<HTMLDivElement>(null);

 useEffect(() => {
   messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
 }, [messages]);

 useEffect(() => {
   if (apiKey) {
     const mistral = new MistralApiService(apiKey);
     const memory = new CognitiveMemoryService(mistral, userId);
     const agent = new CognitiveAgent(mistral, memory);
     
     setMistralService(mistral);
     setMemoryService(memory);
     setCognitiveAgent(agent);
     localStorage.setItem('mistral_api_key', apiKey);
   }
 }, [apiKey, userId]);

 const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

 const handleSendMessage = async () => {
   if (!inputValue.trim() || isLoading || !cognitiveAgent || !memoryService) return;

   const userMessage: Message = {
     id: generateId(),
     content: inputValue,
     sender: 'user',
     timestamp: new Date()
   };

   setMessages(prev => [...prev, userMessage]);
   cognitiveAgent.addToHistory(userMessage);
   setInputValue('');
   setIsLoading(true);

   try {
     // Obtenir le message précédent pour détecter les corrections
     const previousMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
     
     const result = await cognitiveAgent.processMessage(inputValue, previousMessage);

     const assistantMessage: Message = {
       id: generateId(),
       content: result.response,
       sender: 'assistant',
       timestamp: new Date(),
       memoryActions: result.memoryActions,
       corrected: !!result.learningEvent
     };

     setMessages(prev => [...prev, assistantMessage]);
     cognitiveAgent.addToHistory(assistantMessage);

     // Si il y a eu une correction, marquer le message précédent
     if (result.learningEvent && messages.length > 0) {
       setMessages(prev => prev.map((msg, index) => 
         index === prev.length - 1 ? { ...msg, hasError: true } : msg
       ));
     }

   } catch (error) {
     console.error('Erreur:', error);
     const errorMessage: Message = {
       id: generateId(),
       content: "Erreur de connexion.",
       sender: 'assistant',
       timestamp: new Date()
     };
     setMessages(prev => [...prev, errorMessage]);
   } finally {
     setIsLoading(false);
   }
 };

 const handleKeyPress = (e: React.KeyboardEvent) => {
   if (e.key === 'Enter' && !e.shiftKey) {
     e.preventDefault();
     handleSendMessage();
   }
 };

 // Interface pour la clé API
 if (!apiKey) {
   return (
     <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
       <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
         <div className="text-center mb-6">
           <h1 className="text-2xl font-bold mb-2">🧠 Cognitive AI Assistant</h1>
           <p className="text-gray-600">Mémoire infinie • Auto-apprentissage</p>
         </div>
         
         <input
           type="password"
           value={apiKey}
           onChange={(e) => setApiKey(e.target.value)}
           placeholder="Clé API Mistral"
           className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
         />
         
         <div className="mt-4 p-3 bg-purple-50 rounded-lg text-sm text-purple-700">
           <p className="font-medium mb-1">🚀 Révolution cognitive :</p>
           <p>• Auto-mémorisation intelligente</p>
           <p>• Apprentissage des erreurs</p>
           <p>• Mémoire procédurale/épisodique/sémantique</p>
         </div>
       </div>
     </div>
   );
 }

 const stats = memoryService?.getStats();

 return (
   <div className="h-screen flex flex-col bg-gradient-to-br from-purple-50 to-blue-50">
     {/* Header fixe */}
     <header className="w-full bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
       <div>
         <h1 className="text-xl font-bold text-gray-800">🧠 Cognitive AI Assistant</h1>
         <p className="text-sm text-gray-600">Mémoire infinie • Auto-apprentissage continu</p>
       </div>
       
       {stats && (
         <div className="flex items-center space-x-4 text-sm">
           <div className="flex items-center space-x-2">
             <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
               🔧 {stats.procedural}
             </span>
             <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
               📝 {stats.episodic}
             </span>
             <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
               🧠 {stats.semantic}
             </span>
             <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
               🎯 {stats.learningEvents}
             </span>
           </div>
           
           <button
             onClick={() => {
               memoryService?.clearMemory();
               setMessages([]);
             }}
             className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
           >
             Reset
           </button>
         </div>
       )}
     </header>

     {/* Zone de chat */}
     <div className="flex-1 w-full overflow-hidden">
       <div className="h-full overflow-y-auto p-6 pb-24">
         {messages.length === 0 ? (
           <div className="text-center text-gray-500 py-12">
             <div className="text-4xl mb-4">🧠</div>
             <h2 className="text-xl font-bold mb-2">Assistant Cognitif Révolutionnaire</h2>
             <p className="text-lg mb-4">Je mémorise automatiquement et j'apprends de mes erreurs !</p>
             
             <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto text-left">
               <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                 <h3 className="font-bold text-purple-800 mb-2">🔧 Mémoire Procédurale</h3>
                 <p className="text-sm text-purple-600">J'apprends comment faire les choses et mémorise les processus</p>
               </div>
               
               <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                 <h3 className="font-bold text-blue-800 mb-2">📝 Mémoire Épisodique</h3>
                 <p className="text-sm text-blue-600">Je retiens vos événements personnels, RDV et préférences</p>
               </div>
               
               <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                 <h3 className="font-bold text-green-800 mb-2">🧠 Mémoire Sémantique</h3>
                 <p className="text-sm text-green-600">Je stocke les faits et connaissances importantes</p>
               </div>
             </div>
             
             <div className="mt-6 max-w-2xl mx-auto">
               <div className="bg-gradient-to-r from-orange-50 to-red-50 p-4 rounded-lg border border-orange-200">
                 <h3 className="font-bold text-orange-800 mb-2">🎯 Auto-Apprentissage</h3>
                 <p className="text-sm text-orange-600">Je détecte mes erreurs automatiquement et j'apprends pour ne plus les répéter !</p>
               </div>
             </div>
           </div>
         ) : (
           <div className="max-w-4xl mx-auto space-y-4">
             {messages.map((message) => (
               <div
                 key={message.id}
                 className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
               >
                 <div
                   className={`max-w-xl px-4 py-3 rounded-lg ${
                     message.sender === 'user'
                       ? 'bg-purple-600 text-white'
                       : message.hasError
                       ? 'bg-red-50 text-gray-800 shadow border border-red-200'
                       : message.corrected
                       ? 'bg-green-50 text-gray-800 shadow border border-green-200'
                       : 'bg-white text-gray-800 shadow border'
                   }`}
                 >
                   <p className="whitespace-pre-line">{message.content}</p>
                   
                   <div className="flex justify-between items-center mt-2 text-xs opacity-70">
                     <span>{message.timestamp.toLocaleTimeString()}</span>
                     
                     <div className="flex items-center space-x-1">
                       {message.hasError && (
                         <span className="text-red-500" title="Erreur détectée">❌</span>
                       )}
                       {message.corrected && (
                         <span className="text-green-500" title="Apprentissage appliqué">✅</span>
                       )}
                       {message.memoryActions && message.memoryActions.length > 0 && (
                         <span className="text-purple-500" title={`${message.memoryActions.length} actions mémoire`}>
                           🧠{message.memoryActions.length}
                         </span>
                       )}
                     </div>
                   </div>
                   
                   {/* Affichage des actions mémoire */}
                   {message.memoryActions && message.memoryActions.length > 0 && (
                     <div className="mt-2 pt-2 border-t border-gray-200">
                       <p className="text-xs text-gray-500 mb-1">Actions auto-mémoire :</p>
                       {message.memoryActions.map((action, index) => (
                         <div key={index} className="text-xs bg-gray-100 px-2 py-1 rounded mb-1">
                           <span className="font-medium">
                             {action.category === 'procedural' ? '🔧' : 
                              action.category === 'episodic' ? '📝' : '🧠'} 
                             {action.category}
                           </span>
                           : {action.content.substring(0, 50)}...
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
               </div>
             ))}
             
             {isLoading && (
               <div className="flex justify-start">
                 <div className="bg-gradient-to-r from-purple-100 to-blue-100 px-4 py-3 rounded-lg">
                   <div className="flex items-center space-x-2">
                     <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                     <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                     <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                     <span className="text-sm text-gray-600 ml-2">Analyse cognitive...</span>
                   </div>
                 </div>
               </div>
             )}
             <div ref={messagesEndRef} />
           </div>
         )}
       </div>
     </div>

     {/* Barre d'input fixe en bas */}
     <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-lg">
       <div className="max-w-4xl mx-auto">
         <div className="flex space-x-2 mb-2 text-xs">
           <button
             onClick={() => setInputValue("Je m'appelle Marie et j'ai 28 ans")}
             className="px-2 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
           >
             📝 Info personnelle
           </button>
           <button
             onClick={() => setInputValue("J'ai RDV chez le dentiste vendredi à 14h")}
             className="px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
           >
             📅 Événement
           </button>
           <button
             onClick={() => setInputValue("J'aime le café le matin mais pas après 16h")}
             className="px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
           >
             ⭐ Préférence
           </button>
           <button
             onClick={() => setInputValue("Non, ce n'est pas ça, je voulais dire...")}
             className="px-2 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
           >
             🎯 Correction
           </button>
         </div>
         
         <div className="flex space-x-4">
           <textarea
             value={inputValue}
             onChange={(e) => setInputValue(e.target.value)}
             onKeyPress={handleKeyPress}
             placeholder="Parlez-moi... Je mémorise automatiquement et j'apprends de mes erreurs !"
             className="flex-1 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 resize-none"
             rows={1}
             disabled={isLoading}
           />
           <button
             onClick={handleSendMessage}
             disabled={!inputValue.trim() || isLoading}
             className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-300 text-white rounded-lg font-medium transition-all"
           >
             {isLoading ? '🧠' : '🚀'}
           </button>
         </div>
         
         {stats && (
           <div className="mt-2 text-center text-xs text-gray-500">
             Mémoire active : {stats.totalMemories} souvenirs • {stats.learningEvents} apprentissages
           </div>
         )}
       </div>
     </div>
   </div>
 );
};

export default CognitiveChatBot;