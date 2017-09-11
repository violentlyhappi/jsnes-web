import React, { Component } from "react";
import { Button } from "reactstrap";
import { Link } from "react-router-dom";
import "./RunPage.css";
import config from "./config";
import FrameTimer from "./FrameTimer";
import Screen from "./Screen";
import Speakers from "./Speakers";
import { NES } from "jsnes";

function loadBinary(path, callback) {
  var req = new XMLHttpRequest();
  req.open("GET", path);
  req.overrideMimeType("text/plain; charset=x-user-defined");
  req.onload = function() {
    if (this.status === 200) {
      callback(null, this.responseText);
    } else {
      callback(new Error(req.statusText));
    }
  };
  req.onerror = function() {
    callback(new Error(req.statusText));
  };
  req.send();
}

class RunPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      running: false,
      paused: false,
    };
  }

  render() {
    return (
      <div className="RunPage">
        <nav
          className="navbar navbar-expand"
          ref={el => {
            this.navbar = el;
          }}
        >
          <ul className="navbar-nav mr-auto">
            <li className="navitem">
              <Link to="/" className="nav-link">
                &lsaquo; Back
              </Link>
            </li>
          </ul>
          <Button
            outline
            color="primary"
            onClick={this.handlePauseResume}
            disabled={!this.state.running}
          >
            {this.state.paused ? "Resume" : "Pause"}
          </Button>
        </nav>

        <div
          className="screen-container"
          ref={el => {
            this.screenContainer = el;
          }}
        >
          <Screen
            ref={screen => {
              this.screen = screen;
            }}
            onGenerateFrame={() => {
              this.nes.frame();
            }}
          />
        </div>
      </div>
    );
  }

  componentDidMount() {
    this.speakers = new Speakers({
      onBufferUnderrun: (actualSize, desiredSize) => {
        if (!this.state.running || this.state.paused) {
          return;
        }
        // Skip a video frame so audio remains consistent. This happens for
        // a variety of reasons:
        // - Frame rate is not quite 60fps, so sometimes buffer empties
        // - Page is not visible, so requestAnimationFrame doesn't get fired.
        //   In this case emulator still runs at full speed, but timing is
        //   done by audio instead of requestAnimationFrame.
        // - System can't run emulator at full speed. In this case it'll stop
        //    firing requestAnimationFrame.
        console.log(
          "Buffer underrun, running another frame to try and catch up"
        );
        this.nes.frame();
        // desiredSize will be 2048, and the NES produces 1468 samples on each
        // frame so we might need a second frame to be run. Give up after that
        // though -- the system is not catching up
        if (this.speakers.buffer.size() < desiredSize) {
          console.log("Still buffer underrun, running a second frame");
          this.nes.frame();
        }
      }
    });
    this.nes = new NES({
      onFrame: this.screen.setBuffer,
      onStatusUpdate: console.log,
      onAudioSample: this.speakers.writeSample
    });

    this.frameTimer = new FrameTimer({
      onGenerateFrame: this.nes.frame,
      onWriteFrame: this.screen.writeBuffer
    });

    document.addEventListener("keydown", this.nes.keyboard.keyDown);
    document.addEventListener("keyup", this.nes.keyboard.keyUp);
    document.addEventListener("keypress", this.nes.keyboard.keyPress);

    window.addEventListener("resize", this.layout);
    this.layout();

    this.load();
  }

  componentWillUnmount() {
    this.stop();
    document.removeEventListener("keydown", this.nes.keyboard.keyDown);
    document.removeEventListener("keyup", this.nes.keyboard.keyUp);
    document.removeEventListener("keypress", this.nes.keyboard.keyPress);
    window.removeEventListener("resize", this.layout);
  }

  load = () => {
    const path = config.BASE_ROM_URL + this.props.match.params.rom;
    loadBinary(path, (err, data) => {
      if (err) {
        window.alert(`Error loading ROM: ${err.toString()}`);
      } else {
        this.handleLoaded(data);
      }
    });
  };

  handleLoaded = data => {
    this.setState({ uiEnabled: true, running: true });
    this.nes.loadROM(data);
    this.start();
  };

  start = () => {
    this.frameTimer.start();
    this.speakers.start();
    this.fpsInterval = setInterval(() => {
      console.log(`FPS: ${this.nes.getFPS()}`);
    }, 1000);
  };

  stop = () => {
    this.frameTimer.stop();
    this.speakers.stop();
    clearInterval(this.fpsInterval);
  };

  handlePauseResume = () => {
    if (this.state.paused) {
      this.setState({ paused: false });
      this.start();
    } else {
      this.setState({ paused: true });
      this.stop();
    }
  };

  layout = () => {
    let navbarHeight = parseFloat(window.getComputedStyle(this.navbar).height);
    this.screenContainer.style.height = `${window.innerHeight -
      navbarHeight}px`;
    this.screen.fitInParent();
  };
}

export default RunPage;