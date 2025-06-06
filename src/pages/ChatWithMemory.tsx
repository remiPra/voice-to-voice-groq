//@ts-nocheck
import React, { useState, useEffect, useRef } from 'react';

// Types
interface Message {
 id: string;
 content: string;
 sender: 'user' | 'assistant';
 timestamp: Date;
 usedMemory?: boolean;
 memoryResults?: number;
}

interface EmbeddingChunk {
 id: string;
 content: string;
 embedding: number[];
 timestamp: Date;
 messageId: string;
 tags: string[];
 sender: 'user' | 'assistant';
}

interface MemorySearchResult {
 content: string;
 similarity: number;
 timestamp: Date;
 tags: string[];
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

// Service de mémoire
class MemoryService {
 private conversations: Message[] = [];
 private embeddingChunks: EmbeddingChunk[] = [];
 private mistralService: MistralApiService;

 constructor(mistralService: MistralApiService) {
   this.mistralService = mistralService;
   this.loadMemory();
 }

 private loadMemory() {
   const saved = localStorage.getItem('chat_conversations');
   const savedChunks = localStorage.getItem('chat_embeddings');
   
   if (saved) {
     this.conversations = JSON.parse(saved).map((msg: any) => ({
       ...msg,
       timestamp: new Date(msg.timestamp)
     }));
   }
   if (savedChunks) {
     this.embeddingChunks = JSON.parse(savedChunks).map((chunk: any) => ({
       ...chunk,
       timestamp: new Date(chunk.timestamp)
     }));
   }
 }

 private saveMemory() {
   localStorage.setItem('chat_conversations', JSON.stringify(this.conversations));
   localStorage.setItem('chat_embeddings', JSON.stringify(this.embeddingChunks));
 }

 private extractTags(content: string): string[] {
   const tags: string[] = [];
   const lowerContent = content.toLowerCase();
   
   if (/(travail|boulot|entretien|collègue|bureau|réunion)/.test(lowerContent)) {
     tags.push('travail');
   }
   if (/(famille|parents|enfant|frère|sœur)/.test(lowerContent)) {
     tags.push('famille');
   }
   if (/(sport|exercice|santé|médecin|poids|régime)/.test(lowerContent)) {
     tags.push('santé');
   }
   if (/(projet|objectif|plan|idée|rêve)/.test(lowerContent)) {
     tags.push('projets');
   }
   if (/(nom|appelle|habite|âge|personnel)/.test(lowerContent)) {
     tags.push('personnel');
   }
   
   return tags.length > 0 ? tags : ['général'];
 }

 private cosineSimilarity(a: number[], b: number[]): number {
   if (a.length !== b.length) return 0;
   
   const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
   const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
   const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
   
   if (magnitudeA === 0 || magnitudeB === 0) return 0;
   return dotProduct / (magnitudeA * magnitudeB);
 }

 async addMessage(message: Message): Promise<void> {
   message.tags = this.extractTags(message.content);
   this.conversations.push(message);
   
   if (message.content.length > 5) {
     try {
       const embedding = await this.mistralService.generateEmbedding(message.content);
       const chunk: EmbeddingChunk = {
         id: `${message.id}-chunk`,
         content: message.content,
         embedding,
         timestamp: message.timestamp,
         messageId: message.id,
         tags: message.tags || ['général'],
         sender: message.sender
       };
       this.embeddingChunks.push(chunk);
     } catch (error) {
       console.error('Erreur création embedding:', error);
     }
   }
   
   this.saveMemory();
 }

 async searchMemory(query: string): Promise<MemorySearchResult[]> {
   if (this.embeddingChunks.length === 0) return [];
   
   try {
     const queryEmbedding = await this.mistralService.generateEmbedding(query);
     
     const similarities = this.embeddingChunks.map(chunk => ({
       chunk,
       similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding)
     }));

     return similarities
       .filter(item => item.similarity > 0.3)
       .sort((a, b) => b.similarity - a.similarity)
       .slice(0, 5)
       .map(item => ({
         content: item.chunk.content,
         similarity: item.similarity,
         timestamp: item.chunk.timestamp,
         tags: item.chunk.tags
       }));
   } catch (error) {
     console.error('Erreur recherche mémoire:', error);
     return [];
   }
 }

 getRecentHistory(limit: number = 6): Message[] {
   return this.conversations.slice(-limit);
 }

 getStats(): { totalMessages: number; totalEmbeddings: number } {
   return {
     totalMessages: this.conversations.length,
     totalEmbeddings: this.embeddingChunks.length
   };
 }

 clearMemory(): void {
   this.conversations = [];
   this.embeddingChunks = [];
   localStorage.removeItem('chat_conversations');
   localStorage.removeItem('chat_embeddings');
 }
}

// Agent 1 - Analyseur/Routeur
class AnalyzerAgent {
 private mistralService: MistralApiService;

 constructor(mistralService: MistralApiService) {
   this.mistralService = mistralService;
 }

 async shouldUseMemory(query: string, recentHistory: Message[]): Promise<boolean> {
   const historyContext = recentHistory
     .slice(-3)
     .map(msg => `${msg.sender}: ${msg.content}`)
     .join('\n');

   const analysisPrompt = [
     {
       role: 'system',
       content: `Tu es un agent analyseur. Ta tâche est de déterminer si une question nécessite de chercher dans la mémoire/historique ou si elle peut être répondue contextuellement.

RÉPONDS UNIQUEMENT PAR "OUI" ou "NON".

Utilise la mémoire (OUI) si:
- Questions sur des infos personnelles (nom, âge, goûts, etc.)
- Références au passé ("tu te souviens", "j'avais dit")
- Questions sur des préférences/habitudes mentionnées avant
- Demandes de rappel d'informations

Réponds contextuellement (NON) si:
- Questions générales (météo, actualités, définitions)
- Nouvelles conversations sans référence au passé
- Questions techniques/factuelles
- Demandes créatives (poèmes, code, etc.)

Contexte récent:
${historyContext}`
     },
     {
       role: 'user',
       content: query
     }
   ];

   try {
     const response = await this.mistralService.generateResponse(analysisPrompt);
     return response.trim().toUpperCase().startsWith('OUI');
   } catch (error) {
     console.error('Erreur analyse:', error);
     return false;
   }
 }
}

// Composant principal
const SmartChatBot: React.FC = () => {
 const [messages, setMessages] = useState<Message[]>([]);
 const [inputValue, setInputValue] = useState('');
 const [isLoading, setIsLoading] = useState(false);
 const [apiKey, setApiKey] = useState(localStorage.getItem('mistral_api_key') || '');
 
 const [mistralService, setMistralService] = useState<MistralApiService | null>(null);
 const [memoryService, setMemoryService] = useState<MemoryService | null>(null);
 const [analyzerAgent, setAnalyzerAgent] = useState<AnalyzerAgent | null>(null);

 const messagesEndRef = useRef<HTMLDivElement>(null);

 useEffect(() => {
   messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
 }, [messages]);

 useEffect(() => {
   if (apiKey) {
     const mistral = new MistralApiService(apiKey);
     const memory = new MemoryService(mistral);
     const analyzer = new AnalyzerAgent(mistral);
     
     setMistralService(mistral);
     setMemoryService(memory);
     setAnalyzerAgent(analyzer);
     localStorage.setItem('mistral_api_key', apiKey);
   }
 }, [apiKey]);

 const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

 const handleSendMessage = async () => {
   if (!inputValue.trim() || isLoading || !mistralService || !memoryService || !analyzerAgent) return;

   const userMessage: Message = {
     id: generateId(),
     content: inputValue,
     sender: 'user',
     timestamp: new Date()
   };

   setMessages(prev => [...prev, userMessage]);
   setInputValue('');
   setIsLoading(true);

   try {
     await memoryService.addMessage(userMessage);
     
     // Agent 1 - Analyse si besoin de mémoire
     const recentHistory = memoryService.getRecentHistory(6);
     const needsMemory = await analyzerAgent.shouldUseMemory(inputValue, recentHistory);

     let responseContent: string;
     let memoryResults = 0;

     if (needsMemory) {
       // Recherche dans la mémoire
       const searchResults = await memoryService.searchMemory(inputValue);
       memoryResults = searchResults.length;

       let memoryContext = "";
       if (searchResults.length > 0) {
         memoryContext = "Informations trouvées dans la mémoire:\n";
         searchResults.forEach((result, index) => {
           memoryContext += `${index + 1}. "${result.content}" (${result.tags.join(', ')})\n`;
         });
       }

       const contextMessages = [
         {
           role: 'system',
           content: `Tu es un assistant avec mémoire. L'utilisateur te pose une question et voici les informations pertinentes trouvées:

${memoryContext}

Réponds de manière naturelle en utilisant ces informations. Si aucune info pertinente, dis-le clairement.`
         },
         {
           role: 'user',
           content: inputValue
         }
       ];

       responseContent = await mistralService.generateResponse(contextMessages);
     } else {
       // Réponse contextuelle simple
       const contextMessages = [
         {
           role: 'system',
           content: `Tu es un assistant conversationnel. Réponds naturellement à l'utilisateur.`
         },
         ...recentHistory.slice(-3).map(msg => ({
           role: msg.sender === 'user' ? 'user' : 'assistant',
           content: msg.content
         })),
         {
           role: 'user',
           content: inputValue
         }
       ];

       responseContent = await mistralService.generateResponse(contextMessages);
     }

     const assistantMessage: Message = {
       id: generateId(),
       content: responseContent,
       sender: 'assistant',
       timestamp: new Date(),
       usedMemory: needsMemory,
       memoryResults
     };

     setMessages(prev => [...prev, assistantMessage]);
     await memoryService.addMessage(assistantMessage);

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
     <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
       <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
         <div className="text-center mb-6">
           <h1 className="text-2xl font-bold mb-2">🧠 Smart Chat</h1>
           <p className="text-gray-600">Agent intelligent avec mémoire</p>
         </div>
         
         <input
           type="password"
           value={apiKey}
           onChange={(e) => setApiKey(e.target.value)}
           placeholder="Clé API Mistral"
           className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
         />
       </div>
     </div>
   );
 }

 const stats = memoryService?.getStats();

 return (
   <div className="h-screen flex flex-col bg-gray-50">
     {/* Header fixe */}
     <header className="w-full bg-white border-b px-6 py-4 flex items-center justify-between">
       <div>
         <h1 className="text-xl font-bold">🧠 Smart Chat</h1>
         <p className="text-sm text-gray-600">Agent intelligent à 2 niveaux</p>
       </div>
       
       {stats && (
         <div className="flex items-center space-x-4 text-sm text-gray-600">
           <span>📝 {stats.totalMessages}</span>
           <span>🧠 {stats.totalEmbeddings}</span>
           <button
             onClick={() => memoryService?.clearMemory()}
             className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
           >
             Effacer
           </button>
         </div>
       )}
     </header>

     {/* Zone de chat - 100% width */}
     <div className="flex-1 w-full overflow-hidden">
       <div className="h-full overflow-y-auto p-6 pb-24">
         {messages.length === 0 ? (
           <div className="text-center text-gray-500 py-12">
             <div className="text-4xl mb-4">🤖</div>
             <p className="text-lg mb-2">Salut ! Je suis votre assistant intelligent.</p>
             <p>Posez-moi des questions, je décide automatiquement si j'ai besoin de ma mémoire !</p>
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
                       ? 'bg-blue-600 text-white'
                       : 'bg-white text-gray-800 shadow border'
                   }`}
                 >
                   <p>{message.content}</p>
                   <div className="flex justify-between items-center mt-2 text-xs opacity-70">
                     <span>{message.timestamp.toLocaleTimeString()}</span>
                     {message.usedMemory && (
                       <span className="flex items-center space-x-1">
                         <span>🧠</span>
                         {message.memoryResults && <span>({message.memoryResults})</span>}
                       </span>
                     )}
                   </div>
                 </div>
               </div>
             ))}
             
             {isLoading && (
               <div className="flex justify-start">
                 <div className="bg-gray-200 px-4 py-3 rounded-lg">
                   <div className="flex items-center space-x-2">
                     <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                     <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                     <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                     <span className="text-sm text-gray-600 ml-2">Analyse en cours...</span>
                   </div>
                 </div>
               </div>
             )}
             <div ref={messagesEndRef} />
           </div>
         )}
         
         {/* Section d'explication */}
         <div className="max-w-4xl mx-auto mt-12 bg-white rounded-lg shadow-lg p-6">
           <h3 className="text-lg font-bold mb-4">🔧 Comment fonctionne le système à 2 agents</h3>
           
           <div className="grid md:grid-cols-2 gap-6">
             <div className="bg-blue-50 p-4 rounded-lg">
               <h4 className="font-semibold text-blue-800 mb-2">🕵️ Agent 1 - Analyseur</h4>
               <div className="text-sm text-blue-700 space-y-1">
                 <p>• Analyse votre question</p>
                 <p>• Décide : mémoire ou contextuel ?</p>
                 <p>• Questions perso → Mémoire</p>
                 <p>• Questions générales → Contextuel</p>
               </div>
             </div>
             
             <div className="bg-green-50 p-4 rounded-lg">
               <h4 className="font-semibold text-green-800 mb-2">🤖 Agent 2 - Répondeur</h4>
               <div className="text-sm text-green-700 space-y-1">
                 <p>• Reçoit la décision de l'Agent 1</p>
                 <p>• Si mémoire → Recherche embeddings</p>
                 <p>• Si contextuel → Réponse directe</p>
                 <p>• Génère la réponse finale</p>
               </div>
             </div>
           </div>
           
           <div className="mt-6 bg-gray-50 p-4 rounded-lg">
             <h4 className="font-semibold mb-2">💡 Exemples</h4>
             <div className="grid md:grid-cols-2 gap-4 text-sm">
               <div>
                 <p className="font-medium text-blue-600">🧠 Questions mémoire :</p>
                 <p>• "Comment je m'appelle ?"</p>
                 <p>• "Mes objectifs ?"</p>
                 <p>• "Tu te souviens de... ?"</p>
               </div>
               <div>
                 <p className="font-medium text-green-600">💬 Questions contextuelles :</p>
                 <p>• "Quelle heure est-il ?"</p>
                 <p>• "Explique-moi React"</p>
                 <p>• "Écris un poème"</p>
               </div>
             </div>
           </div>
         </div>
       </div>
     </div>

     {/* Barre d'input fixe en bas */}
     <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
       <div className="max-w-4xl mx-auto flex space-x-4">
         <textarea
           value={inputValue}
           onChange={(e) => setInputValue(e.target.value)}
           onKeyPress={handleKeyPress}
           placeholder="Posez votre question naturellement..."
           className="flex-1 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
           rows={1}
           disabled={isLoading}
         />
         <button
           onClick={handleSendMessage}
           disabled={!inputValue.trim() || isLoading}
           className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg font-medium"
         >
           {isLoading ? '⏳' : '🚀'}
         </button>
       </div>
     </div>
   </div>
 );
};

export default SmartChatBot;