import { TRIAGE_BAND_DEFINITIONS, triageBandForRisk, type TriageBand } from "@/report/triagePresentation";

export type TriageReadingCategoryId =
  | "dyslexiaRisk"
  | "colorVisionRisk"
  | "attentionRisk"
  | "memoryReactionRisk"
  | "cognitivePerformanceRisk";

const MAX_READING_LENGTH = 250;

const TRIAGE_READING_COPY = {
  dyslexiaRisk: {
    extremelyPositive:
      "Excelente, leitura e reconhecimento de letras apareceram bem calibrados nesta sessão. O padrão sugere boa estabilidade para diferenciar símbolos, com poucos sinais de confusão visual neste bloco.",
    positive:
      "Positivo, leitura e letras mostraram boa consistência. Houve resposta segura na maior parte do bloco, com sinais favoráveis para acompanhar instruções visuais e distinguir letras parecidas.",
    good:
      "Bom resultado em leitura e letras. O desempenho foi funcional na sessão, embora pequenas oscilações ainda mereçam observação em tarefas rápidas com letras e palavras.",
    regular:
      "Resultado regular em leitura e letras. A base foi suficiente para concluir o bloco, mas surgiram oscilações que valem ser observadas em leituras rápidas e reconhecimento visual de símbolos.",
    attention:
      "Atenção em leitura e letras. A sessão mostrou mais instabilidade para diferenciar letras ou manter precisão visual, então vale comparar este padrão com outras situações de leitura.",
    needsAttention:
      "Precisa de atenção em leitura e letras. Foram percebidos sinais de dificuldade neste ponto, com maior chance de trocas ou hesitação visual; o ideal é aprofundar a observação com apoio especializado."
  },
  colorVisionRisk: {
    extremelyPositive:
      "Excelente, a identificação de cores e contraste apareceu muito bem ajustada nesta sessão. O bloco indicou respostas seguras para diferenças visuais, com baixa ocorrência de confusão perceptiva.",
    positive:
      "Positivo em cores e contraste. O desempenho ficou estável na maior parte das tentativas, sugerindo boa leitura visual para separar tonalidades e estímulos com contraste.",
    good:
      "Bom resultado em cores e contraste. A sessão foi consistente, embora pequenas variações indiquem que vale observar o desempenho em estímulos visuais mais rápidos ou sutis.",
    regular:
      "Resultado regular em cores e contraste. Houve base funcional no bloco, mas algumas respostas sugerem atenção extra quando a distinção visual depende de tonalidades próximas.",
    attention:
      "Atenção em cores e contraste. A sessão mostrou instabilidade na leitura visual de algumas combinações, então vale comparar este padrão com tarefas reais de identificação de cores.",
    needsAttention:
      "Precisa de atenção em cores e contraste. Foram observadas dificuldades mais frequentes para separar cores ou contraste, o que pede acompanhamento mais próximo desta habilidade."
  },
  attentionRisk: {
    extremelyPositive:
      "Excelente, o bloco de atenção mostrou foco bem sustentado e boa resposta aos estímulos. O padrão sugere controle consistente para acompanhar regras, com pouca perda de alvo ou impulsividade.",
    positive:
      "Positivo em atenção. A sessão indicou boa estabilidade para seguir estímulos e retomar a tarefa, com sinais favoráveis de foco na maior parte do bloco.",
    good:
      "Bom resultado em atenção. O desempenho foi funcional e relativamente estável, ainda que pequenas oscilações mereçam observação em atividades mais longas ou com distrações.",
    regular:
      "Resultado regular em atenção. Houve participação consistente, mas apareceram variações de foco ou ritmo que valem ser observadas em outros contextos da rotina.",
    attention:
      "Atenção no bloco de foco. A sessão trouxe mais perda de estímulos, retomadas lentas ou respostas impulsivas, então vale acompanhar se isso também aparece fora do jogo.",
    needsAttention:
      "Precisa de atenção no foco. Foram identificados sinais mais fortes de oscilação atencional nesta etapa, o que justifica uma observação complementar e mais próxima."
  },
  memoryReactionRisk: {
    extremelyPositive:
      "Excelente, memória e tempo de reação apareceram bem ajustados nesta sessão. O bloco mostrou boa manutenção de sequência e resposta rápida, com poucas quebras de ritmo.",
    positive:
      "Positivo em memória e reação. O desempenho ficou estável na maior parte da fase, sugerindo boa resposta para lembrar sequências e agir com agilidade.",
    good:
      "Bom resultado em memória e reação. A sessão foi funcional, embora pequenas variações indiquem que vale observar o ritmo e a consistência em novas tentativas.",
    regular:
      "Resultado regular em memória e reação. Houve base suficiente para a tarefa, mas oscilações de tempo ou sequência merecem acompanhamento em outros momentos.",
    attention:
      "Atenção em memória e reação. A sessão mostrou mais lentidão, quebra de sequência ou impulsividade, então vale verificar se esse padrão se repete em novas fases.",
    needsAttention:
      "Precisa de atenção em memória e reação. Foram observadas dificuldades mais marcadas para sustentar sequência e responder no tempo esperado, pedindo leitura complementar."
  },
  cognitivePerformanceRisk: {
    extremelyPositive:
      "Excelente, o desempenho cognitivo geral apareceu muito equilibrado nesta sessão. Velocidade, controle e memória de trabalho formaram um conjunto bastante favorável neste bloco.",
    positive:
      "Positivo no desempenho cognitivo. O bloco sugeriu boa integração entre resposta, memória e controle, com sinais consistentes de organização durante a atividade.",
    good:
      "Bom resultado no desempenho cognitivo. A sessão foi estável no geral, embora pequenas oscilações indiquem espaço para observar consistência em outras tentativas.",
    regular:
      "Resultado regular no desempenho cognitivo. O conjunto da sessão foi funcional, mas com variações que merecem acompanhamento antes de qualquer leitura mais ampla.",
    attention:
      "Atenção no desempenho cognitivo. A combinação entre ritmo, memória e controle mostrou instabilidade maior nesta sessão, então vale observar se o padrão se repete.",
    needsAttention:
      "Precisa de atenção no desempenho cognitivo. Esta etapa reuniu sinais de dificuldade em mais de um aspecto do bloco, pedindo observação complementar e interpretação cuidadosa."
  }
} satisfies Record<TriageReadingCategoryId, Record<TriageBand, string>>;

function validateTriageReadings() {
  for (const [categoryId, categoryMessages] of Object.entries(TRIAGE_READING_COPY) as Array<
    [TriageReadingCategoryId, Record<TriageBand, string>]
  >) {
    for (const band of TRIAGE_BAND_DEFINITIONS) {
      const message = categoryMessages[band.key];

      if (typeof message !== "string" || message.trim().length === 0) {
        throw new Error(`Missing triage reading for ${categoryId}:${band.key}`);
      }

      if (message.length > MAX_READING_LENGTH) {
        throw new Error(
          `Triage reading for ${categoryId}:${band.key} exceeds ${MAX_READING_LENGTH} characters`
        );
      }
    }
  }
}

if (process.env.NODE_ENV !== "production") {
  validateTriageReadings();
}

export function triageReadingForCategory(categoryId: TriageReadingCategoryId, band: TriageBand) {
  return TRIAGE_READING_COPY[categoryId][band];
}

export function triageReadingForScore(categoryId: TriageReadingCategoryId, rawRiskScore: number) {
  return triageReadingForCategory(categoryId, triageBandForRisk(rawRiskScore).key);
}
