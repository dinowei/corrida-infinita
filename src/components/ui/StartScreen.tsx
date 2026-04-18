type StartScreenProps = {
  isVisible: boolean;
  onStart: () => void;
};

export default function StartScreen({ isVisible, onStart }: StartScreenProps) {
  return (
    <section
      className={`start-screen${isVisible ? ' visible' : ' hidden'}`}
      aria-hidden={!isVisible}
    >
      <div className="eyebrow">AAA Web Experience</div>
      <h1>Corrida Infinita GT-R</h1>
      <p>
        Cena 3D carregada sob demanda, Nissan GT-R comprimido com Draco e
        arquitetura modular inspirada em engines de console.
      </p>
      <button type="button" onClick={onStart}>
        Iniciar corrida
      </button>
    </section>
  );
}
