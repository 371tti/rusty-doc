use std::sync::Arc;

pub struct State {

}

impl State {
    pub fn new() -> Self {
        State {}
    }

    pub fn new_arc() -> Arc<Self> {
        Arc::new(State::new())
    }

    
}