(() => {
  class BreathingSession {
    constructor({ now = () => performance.now(), schedule = fn => setInterval(fn, 150), cancel = id => clearInterval(id), onChange = () => {} } = {}) {
      this.now=now;this.schedule=schedule;this.cancel=cancel;this.onChange=onChange;this.timer=null;this.generation=0;this.elapsedMs=0;this.since=0;this.state='ready';this.disposed=false;
    }
    snapshot() {
      const elapsedMs=Math.min(60000,this.elapsedMs+(this.state==='running'?Math.max(0,this.now()-this.since):0));
      const position=elapsedMs%10000,inhale=position<4000;
      return {state:this.state,elapsedMs,remainingSeconds:Math.ceil((60000-elapsedMs)/1000),phase:inhale?'inhale':'exhale',phaseSeconds:Math.ceil((inhale?4000-position:10000-position)/1000),progress:inhale?position/4000:(position-4000)/6000};
    }
    emit() {const value=this.snapshot();if(!this.disposed)this.onChange(value);return value;}
    clear() {this.generation++;if(this.timer!==null)this.cancel(this.timer);this.timer=null;}
    run() {
      this.clear();this.since=this.now();this.state='running';const generation=this.generation;
      this.timer=this.schedule(()=>{if(this.disposed||this.state!=='running'||generation!==this.generation)return;if(this.snapshot().elapsedMs>=60000){this.elapsedMs=60000;this.state='completed';this.clear();}this.emit();});return this.emit();
    }
    start() {if(this.disposed||this.state!=='ready')return this.snapshot();return this.run();}
    pause() {if(this.disposed||this.state!=='running')return this.snapshot();this.elapsedMs=this.snapshot().elapsedMs;this.state=this.elapsedMs>=60000?'completed':'paused';this.clear();return this.emit();}
    resume() {if(this.disposed||this.state!=='paused')return this.snapshot();return this.run();}
    reset() {if(this.disposed)return this.snapshot();this.clear();this.state='ready';this.elapsedMs=0;return this.emit();}
    dispose() {this.clear();this.state='ready';this.elapsedMs=0;this.disposed=true;}
  }
  globalThis.PetSession=Object.freeze({BreathingSession});
})();
