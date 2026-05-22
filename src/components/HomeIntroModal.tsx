"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import styles from "./HomeIntroModal.module.css";

export function HomeIntroModal() {
  const [isOpen, setIsOpen] = useState(true);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const { overflow } = document.body.style;

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="home-intro-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          setIsOpen(false);
        }
      }}
    >
      <div className={styles.modal}>
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.closeButton}
          aria-label="Fechar apresentação"
          onClick={() => setIsOpen(false)}
        >
          X
        </button>
        <div className={styles.scrollArea}>
          <section className={styles.heroHeader}>
              <Image
                src="/images/child.webp"
                alt="Ilustração de uma criança realizando atividade enquanto dois adultos observam com dúvidas."
                width={720}
                height={480}
                priority
                className={styles.heroImage}
                sizes="(max-width: 820px) 100vw, 720px"
              />
              <h1 id="home-intro-title" className={styles.title}>
                Kogniffy AI: Tecnologia para apoiar a identificação precoce de dificuldades cognitivas
              </h1>
          </section>
          <div className={styles.content}>
            <p className={styles.copy}>
              Muitas vezes, os pais percebem que algo não está indo bem no desenvolvimento dos filhos ou na forma
              como eles realizam atividades do cotidiano, mas não conseguem identificar exatamente o que está
              acontecendo. Dificuldades para ler e interpretar informações, distinguir cores, manter a atenção em
              determinadas tarefas, memorizar instruções, reagir rapidamente a estímulos ou até mesmo executar
              atividades simples do dia a dia podem passar despercebidas ou ser confundidas com distração,
              desinteresse ou apenas características da personalidade da criança.
            </p>

            <p className={styles.copy}>
              Em algumas situações, esses comportamentos podem estar relacionados a fatores que merecem maior atenção,
              como possíveis dificuldades de leitura associadas à dislexia, alterações na percepção de cores
              relacionadas ao daltonismo, déficits de atenção, dificuldades de memória, processamento cognitivo ou
              tempos de reação abaixo do esperado para determinada faixa etária.
            </p>

            <p className={styles.copy}>
              Diversos estudos indicam que a identificação precoce desses sinais aumenta significativamente as
              oportunidades de intervenção e acompanhamento adequados, contribuindo para o desenvolvimento da criança e
              para a superação de desafios presentes em seu dia a dia.
            </p>

            <h2 className={styles.sectionTitle}>O propósito do Kogniffy AI</h2>

            <p className={styles.copy}>
              O Kogniffy AI foi criado com o objetivo de explorar o uso da Inteligência Artificial como ferramenta de apoio na identificação de pontos de atenção que possam indicar possíveis dificuldades cognitivas ou comportamentais. Para isso, utiliza uma abordagem acessível, lúdica e não invasiva, baseada na análise de comportamentos observados durante atividades interativas.
            </p>

            <h2 className={styles.sectionTitle}>Como a plataforma funciona</h2>

            <p className={styles.copy}>
              A plataforma é composta por uma série de atividades interativas e mini jogos cuidadosamente elaborados
              para avaliar diferentes habilidades cognitivas. Durante a execução das atividades, o sistema coleta e
              analisa informações relacionadas ao comportamento do participante, observando padrões que podem auxiliar
              na identificação de necessidades de acompanhamento especializado.
            </p>

            <h2 className={styles.sectionTitle}>Indicadores analisados</h2>

            <p className={styles.copy}>
              Entre os indicadores analisados pelo sistema estão tempo de reação, capacidade de atenção e
              concentração, memória de curto prazo, reconhecimento de padrões, processamento visual, desempenho em
              atividades de leitura, frequência de erros e tentativas, tomada de decisão e evolução do desempenho ao
              longo das atividades.
            </p>

            <h2 className={styles.sectionTitle}>Uso de Inteligência Artificial</h2>

            <p className={styles.copy}>
              Cada atividade possui um modelo próprio de Inteligência Artificial treinado para analisar características
              específicas relacionadas ao objetivo daquele desafio. Esses modelos foram desenvolvidos para identificar
              padrões comportamentais, analisar métricas de desempenho e gerar indicadores que possam apontar possíveis
              áreas que mereçam atenção adicional.
            </p>

            <p className={styles.copy}>
              O Kogniffy AI utiliza técnicas de aprendizado de máquina para correlacionar diferentes variáveis
              observadas durante as interações do usuário, permitindo uma análise mais ampla sobre aspectos
              relacionados à cognição, memória, atenção, percepção visual e velocidade de processamento de
              informações.
            </p>

            <h2 className={styles.sectionTitle}>Importante: não é um diagnóstico</h2>

            <p className={styles.copy}>
              É importante destacar que o <strong>Kogniffy AI não realiza diagnósticos médicos, psicológicos,
              neurológicos ou pedagógicos</strong>. Os resultados apresentados pela plataforma devem ser interpretados
              exclusivamente como uma triagem inicial de atenção, servindo como apoio para pais, responsáveis,
              educadores e profissionais interessados em compreender melhor determinados comportamentos observados
              durante as atividades.
            </p>

            <p className={styles.copy}>
              Qualquer conclusão relacionada a transtornos, dificuldades de aprendizagem ou condições cognitivas deve
              ser realizada exclusivamente por profissionais habilitados, por meio de avaliações clínicas e pedagógicas
              apropriadas.
            </p>

            <h2 className={styles.sectionTitle}>Propósito do projeto</h2>

            <p className={styles.copy}>
              O propósito do Kogniffy AI é utilizar a tecnologia e a Inteligência Artificial para contribuir com a
              identificação precoce de possíveis dificuldades, auxiliando famílias e profissionais na percepção de
              sinais que muitas vezes passam despercebidos. Ao fornecer informações baseadas em dados comportamentais
              coletados durante atividades lúdicas, a plataforma busca incentivar a busca por orientação especializada
              quando necessário, promovendo melhores oportunidades de desenvolvimento, aprendizagem e qualidade de vida
              para as crianças.
            </p>
          </div>
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.primaryButton} onClick={() => setIsOpen(false)}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
